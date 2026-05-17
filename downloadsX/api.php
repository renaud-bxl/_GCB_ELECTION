<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

require_once __DIR__ . '/extractor.php';

// ---------------------------------------------------------------------------
// yt-dlp extractor (méthode principale — la plus fiable)
// ---------------------------------------------------------------------------

function ytdlpExtract(string $url): array
{
    $ytdlp = findBin(['yt-dlp', '/usr/local/bin/yt-dlp', '/usr/bin/yt-dlp',
                      '/usr/local/share/yt-dlp/yt-dlp', '/opt/yt-dlp/yt-dlp']);
    if (!$ytdlp) return ['sources' => [], 'title' => '', 'thumbnail' => '', 'error' => 'yt-dlp introuvable'];

    $cmd = 'timeout 45 ' . escapeshellarg($ytdlp)
         . ' --no-check-certificate'
         . ' --dump-json'
         . ' --no-playlist'
         . ' --no-warnings'
         . ' ' . escapeshellarg($url)
         . ' 2>/dev/null';

    $json = shell_exec($cmd);
    if (!$json) return ['sources' => [], 'title' => '', 'thumbnail' => '', 'error' => 'yt-dlp n\'a rien retourné'];

    $data = @json_decode($json, true);
    if (!is_array($data)) return ['sources' => [], 'title' => '', 'thumbnail' => '', 'error' => 'JSON invalide'];

    $sources   = [];
    $seenUrls  = [];

    // Parcourir les formats disponibles
    foreach ($data['formats'] ?? [] as $fmt) {
        $fmtUrl = $fmt['url'] ?? $fmt['fragment_base_url'] ?? '';
        if (!$fmtUrl || !str_starts_with($fmtUrl, 'http')) continue;
        if (isset($seenUrls[$fmtUrl])) continue;
        $seenUrls[$fmtUrl] = true;

        $ext     = $fmt['ext']    ?? 'mp4';
        $height  = $fmt['height'] ?? null;
        $vcodec  = $fmt['vcodec'] ?? '';
        $acodec  = $fmt['acodec'] ?? '';

        // Ignorer les formats audio-only ou "none"
        if ($vcodec === 'none' || $ext === 'none') continue;

        $quality = $height ? "{$height}p" : ($fmt['format_note'] ?? $fmt['format_id'] ?? 'unknown');
        $format  = in_array($ext, ['m3u8','mpd','m3u8_native']) ? ($ext === 'mpd' ? 'mpd' : 'm3u8') : $ext;

        // Préférer mp4 et m3u8, ignorer les formats trop exotiques
        if (!in_array($format, ['mp4','m3u8','webm','mpd','mov','ts','m4v'])) continue;

        $sources[] = [
            'url'     => $fmtUrl,
            'quality' => $quality,
            'format'  => $format,
            'source'  => 'yt-dlp',
            'size_mb' => $fmt['filesize'] ? round($fmt['filesize'] / 1048576, 1) : null,
        ];
    }

    // Trier par qualité décroissante
    usort($sources, fn($a, $b) => qualityScore($b) - qualityScore($a));

    return [
        'sources'   => $sources,
        'title'     => $data['title']     ?? '',
        'thumbnail' => $data['thumbnail'] ?? '',
        'error'     => empty($sources) ? 'Aucun format vidéo trouvé' : '',
    ];
}

function qualityScore(array $src): int
{
    $q = strtolower($src['quality'] ?? '');
    foreach (['2160'=>95,'4k'=>95,'1440'=>88,'1080'=>80,'720'=>70,
              '480'=>50,'360'=>40,'240'=>30,'hls'=>60,'dash'=>62,'hd'=>75] as $k => $v) {
        if (str_contains($q, (string)$k)) return $v;
    }
    return 20;
}

function findBin(array $candidates): ?string
{
    // Check PATH first
    $which = trim((string)shell_exec('which yt-dlp 2>/dev/null'));
    if ($which && file_exists($which)) return $which;
    foreach ($candidates as $p) {
        if ($p && file_exists($p) && is_executable($p)) return $p;
    }
    return null;
}

function ytdlpAvailable(): bool
{
    return (bool) findBin(['yt-dlp', '/usr/local/bin/yt-dlp', '/usr/bin/yt-dlp']);
}

// ---------------------------------------------------------------------------
// PHP fallback extractor
// ---------------------------------------------------------------------------

function phpExtract(string $url): array
{
    $extractor = new VideoExtractor($url);
    $extractor->fetch();
    $sources = $extractor->extract();
    return [
        'sources'   => $sources,
        'title'     => $extractor->getTitle(),
        'thumbnail' => $extractor->getThumbnail(),
        'error'     => '',
    ];
}

// ---------------------------------------------------------------------------
function jsonError(string $message, int $code = 400): never
{
    http_response_code($code);
    echo json_encode(['success' => false, 'error' => $message], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

$action = $_GET['action'] ?? 'info';

switch ($action) {

    // -----------------------------------------------------------------------
    case 'info':
        $url = trim($_GET['url'] ?? $_POST['url'] ?? '');
        if (empty($url))                          jsonError('Paramètre "url" manquant');
        if (!filter_var($url, FILTER_VALIDATE_URL)) jsonError('URL invalide');

        $forcePhp = (bool)($_GET['php'] ?? false);
        $result   = ['sources' => [], 'title' => '', 'thumbnail' => '', 'error' => ''];
        $method   = 'none';

        // 1. yt-dlp (prioritaire — gère xHamster, xVideos, PornHub, YouTube, etc.)
        if (!$forcePhp && ytdlpAvailable()) {
            $result = ytdlpExtract($url);
            $method = 'yt-dlp';
        }

        // 2. PHP regex fallback (si yt-dlp absent ou n'a rien trouvé)
        $realSources = array_filter($result['sources'], fn($s) => !empty($s['url']));
        if (empty($realSources) || $forcePhp) {
            try {
                $php    = phpExtract($url);
                $method = $forcePhp ? 'php' : ($method === 'yt-dlp' ? 'yt-dlp+php' : 'php');
                // Merge : garder titre/thumbnail si yt-dlp n'en avait pas
                if (!$result['title'])     $result['title']     = $php['title'];
                if (!$result['thumbnail']) $result['thumbnail'] = $php['thumbnail'];
                // Ajouter les sources PHP non-dupliquées
                $existingUrls = array_column($result['sources'], 'url');
                foreach ($php['sources'] as $s) {
                    if (!empty($s['url']) && !in_array($s['url'], $existingUrls, true))
                        $result['sources'][] = $s;
                }
            } catch (Throwable $e) {
                if (empty($result['sources'])) $result['error'] = $e->getMessage();
            }
        }

        $realCount = count(array_filter($result['sources'], fn($s) => !empty($s['url'])));

        echo json_encode([
            'success'   => true,
            'url'       => $url,
            'title'     => $result['title'],
            'thumbnail' => $result['thumbnail'],
            'sources'   => array_values($result['sources']),
            'count'     => $realCount,
            'method'    => $method,
            'error'     => $result['error'] ?: null,
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
        break;

    // -----------------------------------------------------------------------
    case 'download':
        $url = trim($_GET['url'] ?? '');
        if (empty($url))                          jsonError('Paramètre "url" manquant');
        if (!filter_var($url, FILTER_VALIDATE_URL)) jsonError('URL invalide');

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_NOBODY => true, CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true, CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_TIMEOUT => 10,
            CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        ]);
        curl_exec($ch);
        $contentType = (string) curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
        $finalUrl    = (string) curl_getinfo($ch, CURLINFO_EFFECTIVE_URL);
        curl_close($ch);

        $allowed = ['video/','application/octet-stream','application/vnd.apple',
                    'application/x-mpegURL','binary/'];
        $ok = array_reduce($allowed, fn($c, $p) => $c || str_contains($contentType, $p), false);
        foreach (['mp4','m3u8','webm','ts','avi','mkv','mov'] as $ext) {
            if (str_ends_with(strtolower(parse_url($url, PHP_URL_PATH) ?? ''), '.'.$ext)) { $ok = true; break; }
        }
        if (!$ok) jsonError('URL ne pointe pas vers une ressource vidéo valide');

        $filename = preg_replace('/[^a-zA-Z0-9._-]/', '_',
            basename(parse_url($finalUrl, PHP_URL_PATH) ?: 'video.mp4'));
        header('Content-Type: ' . ($contentType ?: 'application/octet-stream'));
        header('Content-Disposition: attachment; filename="' . $filename . '"');
        header('X-Accel-Buffering: no');

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => false, CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_SSL_VERIFYPEER => false, CURLOPT_TIMEOUT => 0,
            CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            CURLOPT_WRITEFUNCTION => function($ch, $data) { echo $data; flush(); return strlen($data); },
        ]);
        curl_exec($ch);
        curl_close($ch);
        break;

    // -----------------------------------------------------------------------
    case 'probe':
        $url = trim($_GET['url'] ?? '');
        if (empty($url)) jsonError('Paramètre "url" manquant');

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_NOBODY => true, CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true, CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_TIMEOUT => 10,
            CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        ]);
        curl_exec($ch);
        $info = curl_getinfo($ch);
        curl_close($ch);

        echo json_encode([
            'success'      => true,
            'content_type' => $info['content_type'],
            'size_bytes'   => $info['download_content_length'],
            'size_mb'      => $info['download_content_length'] > 0
                ? round($info['download_content_length'] / 1048576, 2) : null,
            'http_code'    => $info['http_code'],
            'final_url'    => $info['url'],
        ], JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
        break;

    // -----------------------------------------------------------------------
    case 'check':
        // Vérifie quels extracteurs sont disponibles
        echo json_encode([
            'success'          => true,
            'yt_dlp'           => ytdlpAvailable(),
            'yt_dlp_path'      => findBin(['yt-dlp','/usr/local/bin/yt-dlp','/usr/bin/yt-dlp']),
            'php_curl'         => function_exists('curl_init'),
            'php_shell_exec'   => function_exists('shell_exec'),
            'php_proc_open'    => function_exists('proc_open'),
            'php_version'      => PHP_VERSION,
        ], JSON_PRETTY_PRINT);
        break;

    default:
        jsonError('Action inconnue. Disponibles : info, download, probe, check');
}
