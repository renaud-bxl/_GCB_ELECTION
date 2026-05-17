<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require_once __DIR__ . '/extractor.php';

function playwrightExtract(string $url): array
{
    $script  = __DIR__ . '/playwright-extract.js';
    if (!file_exists($script)) return [];

    // Find node binary
    $node = trim((string)shell_exec('which node 2>/dev/null'))
         ?: '/opt/node22/bin/node';
    if (!$node || !file_exists($node)) return [];

    $cmd     = escapeshellarg($node) . ' ' . escapeshellarg($script) . ' ' . escapeshellarg($url) . ' 25000';
    $output  = '';
    $retcode = 0;

    // Run with timeout (30s hard limit via shell)
    $descriptors = [0 => ['pipe','r'], 1 => ['pipe','w'], 2 => ['pipe','w']];
    $proc = proc_open('timeout 30 ' . $cmd, $descriptors, $pipes);
    if (!is_resource($proc)) return [];

    fclose($pipes[0]);
    $output = stream_get_contents($pipes[1]);
    fclose($pipes[1]);
    fclose($pipes[2]);
    proc_close($proc);

    $data = @json_decode($output ?: '[]', true);
    return is_array($data) ? $data : [];
}

function jsonError(string $message, int $code = 400): never
{
    http_response_code($code);
    echo json_encode(['success' => false, 'error' => $message], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

// ---- Routing ---------------------------------------------------------------

$action = $_GET['action'] ?? 'info';

switch ($action) {

    case 'info':
        $url = trim($_GET['url'] ?? $_POST['url'] ?? '');
        if (empty($url)) jsonError('Paramètre "url" manquant');
        if (!filter_var($url, FILTER_VALIDATE_URL)) jsonError('URL invalide');

        $usePlaywright = (bool)($_GET['pw'] ?? false);   // force playwright
        $title = $thumbnail = '';
        $sources = [];
        $method  = 'php';

        try {
            // Step 1 — PHP extractor (fast, no browser)
            $extractor = new VideoExtractor($url);
            $extractor->fetch();
            $sources   = $extractor->extract();
            $title     = $extractor->getTitle();
            $thumbnail = $extractor->getThumbnail();

            // Filter out note-only entries
            $realSources = array_filter($sources, fn($s) => !empty($s['url']));

            // Step 2 — Playwright fallback if PHP found nothing real
            if (empty($realSources) || $usePlaywright) {
                $pw = playwrightExtract($url);
                if (!empty($pw)) {
                    // Merge: playwright results take priority, but keep PHP metadata
                    $existingUrls = array_column($sources, 'url');
                    foreach ($pw as $s) {
                        if (!in_array($s['url'], $existingUrls, true)) {
                            $sources[] = $s;
                        }
                    }
                    $method = empty($realSources) ? 'playwright' : 'php+playwright';
                }
            }
        } catch (Throwable $e) {
            // PHP extraction failed — try playwright anyway
            try {
                $sources = playwrightExtract($url);
                $method  = 'playwright-only';
            } catch (Throwable $e2) {
                jsonError($e->getMessage() . ' | PW: ' . $e2->getMessage(), 500);
            }
        }

        echo json_encode([
            'success'   => true,
            'url'       => $url,
            'title'     => $title,
            'thumbnail' => $thumbnail,
            'sources'   => array_values($sources),
            'count'     => count(array_filter($sources, fn($s) => !empty($s['url']))),
            'method'    => $method,
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
        break;

    case 'download':
        $url = trim($_GET['url'] ?? '');
        if (empty($url)) jsonError('Paramètre "url" manquant');
        if (!filter_var($url, FILTER_VALIDATE_URL)) jsonError('URL invalide');

        // Security: only allow video/media content-types
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_NOBODY         => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_TIMEOUT        => 10,
            CURLOPT_USERAGENT      => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        ]);
        curl_exec($ch);
        $contentType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
        $finalUrl    = curl_getinfo($ch, CURLINFO_EFFECTIVE_URL);
        curl_close($ch);

        $allowed = ['video/', 'application/octet-stream', 'application/vnd.apple', 'application/x-mpegURL', 'binary/'];
        $ok = false;
        foreach ($allowed as $prefix) {
            if (str_contains((string) $contentType, $prefix)) {
                $ok = true;
                break;
            }
        }
        // Also allow if URL ends with video extension
        $lowerUrl = strtolower(parse_url($url, PHP_URL_PATH) ?? '');
        foreach (['mp4', 'm3u8', 'webm', 'ts', 'avi', 'mkv', 'mov'] as $ext) {
            if (str_ends_with($lowerUrl, '.' . $ext)) {
                $ok = true;
                break;
            }
        }
        if (!$ok) {
            jsonError('URL ne pointe pas vers une ressource vidéo valide');
        }

        // Stream the file to the browser
        $filename = basename(parse_url($finalUrl, PHP_URL_PATH) ?: 'video.mp4');
        $filename = preg_replace('/[^a-zA-Z0-9._-]/', '_', $filename);

        header('Content-Type: ' . ($contentType ?: 'application/octet-stream'));
        header('Content-Disposition: attachment; filename="' . $filename . '"');
        header('X-Accel-Buffering: no');

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => false,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_TIMEOUT        => 0,
            CURLOPT_USERAGENT      => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            CURLOPT_WRITEFUNCTION  => function ($ch, $data) {
                echo $data;
                flush();
                return strlen($data);
            },
        ]);
        curl_exec($ch);
        curl_close($ch);
        break;

    case 'probe':
        // Quick probe: return content-type and size of a URL
        $url = trim($_GET['url'] ?? '');
        if (empty($url)) jsonError('Paramètre "url" manquant');

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_NOBODY         => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_TIMEOUT        => 10,
            CURLOPT_USERAGENT      => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        ]);
        curl_exec($ch);
        $info = curl_getinfo($ch);
        curl_close($ch);

        echo json_encode([
            'success'      => true,
            'content_type' => $info['content_type'],
            'size_bytes'   => $info['download_content_length'],
            'size_mb'      => $info['download_content_length'] > 0
                ? round($info['download_content_length'] / 1048576, 2)
                : null,
            'http_code'    => $info['http_code'],
            'final_url'    => $info['url'],
        ], JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
        break;

    default:
        jsonError('Action inconnue. Actions disponibles: info, download, probe');
}
