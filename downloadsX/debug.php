<?php
/**
 * debug.php — Diagnostique ce que le serveur reçoit vraiment
 * Usage : debug.php?url=https://fra.xhamster.com/videos/...
 * SUPPRIMER ce fichier après diagnostic !
 */
declare(strict_types=1);

$url = trim($_GET['url'] ?? '');
if (!$url || !filter_var($url, FILTER_VALIDATE_URL)) {
    die(json_encode(['error' => 'URL manquante ou invalide']));
}

// Fetch très réaliste
$ch = curl_init();
curl_setopt_array($ch, [
    CURLOPT_URL            => $url,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_MAXREDIRS      => 5,
    CURLOPT_TIMEOUT        => 30,
    CURLOPT_SSL_VERIFYPEER => false,
    CURLOPT_ENCODING       => '',   // accepte gzip/br automatiquement
    CURLOPT_USERAGENT      => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    CURLOPT_HTTPHEADER     => [
        'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language: fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control: no-cache',
        'DNT: 1',
        'Sec-Fetch-Dest: document',
        'Sec-Fetch-Mode: navigate',
        'Sec-Fetch-Site: none',
        'Sec-Fetch-User: ?1',
        'Upgrade-Insecure-Requests: 1',
    ],
    CURLOPT_COOKIEFILE => sys_get_temp_dir() . '/dx_cookies.txt',
    CURLOPT_COOKIEJAR  => sys_get_temp_dir() . '/dx_cookies.txt',
]);
$html     = curl_exec($ch);
$info     = curl_getinfo($ch);
$err      = curl_error($ch);
curl_close($ch);

$size     = strlen((string)$html);
$hasInit  = str_contains((string)$html, 'window.initials');
$hasMp4   = str_contains((string)$html, '.mp4');
$hasM3u8  = str_contains((string)$html, '.m3u8');
$hasXhcdn = str_contains((string)$html, 'xhcdn.com');

// Extraire un bout de window.initials si présent
$snippet = '';
if ($hasInit) {
    $pos = strpos((string)$html, 'window.initials');
    $snippet = substr((string)$html, $pos, 300);
}

header('Content-Type: application/json');
echo json_encode([
    'http_code'       => $info['http_code'],
    'final_url'       => $info['url'],
    'size_bytes'      => $size,
    'curl_error'      => $err ?: null,
    'has_window_initials' => $hasInit,
    'has_mp4'         => $hasMp4,
    'has_m3u8'        => $hasM3u8,
    'has_xhcdn_com'   => $hasXhcdn,
    'initials_snippet'=> $snippet ?: null,
    'html_preview'    => substr((string)$html, 0, 500),
], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
