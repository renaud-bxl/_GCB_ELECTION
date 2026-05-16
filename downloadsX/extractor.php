<?php

declare(strict_types=1);

class VideoExtractor
{
    private string $url;
    private string $html = '';
    private array $responseHeaders = [];
    private string $finalUrl = '';

    private const USER_AGENTS = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0',
    ];

    public function __construct(string $url)
    {
        $this->url = $url;
    }

    public function fetch(): bool
    {
        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL            => $this->url,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS      => 5,
            CURLOPT_TIMEOUT        => 30,
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_SSL_VERIFYHOST => false,
            CURLOPT_ENCODING       => 'gzip, deflate, br',
            CURLOPT_USERAGENT      => self::USER_AGENTS[array_rand(self::USER_AGENTS)],
            CURLOPT_HTTPHEADER     => [
                'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language: fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
                'Accept-Encoding: gzip, deflate, br',
                'DNT: 1',
                'Upgrade-Insecure-Requests: 1',
                'Sec-Fetch-Dest: document',
                'Sec-Fetch-Mode: navigate',
                'Sec-Fetch-Site: none',
                'Cache-Control: max-age=0',
            ],
            CURLOPT_HEADERFUNCTION => function ($ch, $header) {
                $this->responseHeaders[] = trim($header);
                return strlen($header);
            },
            CURLOPT_COOKIEFILE     => '',
            CURLOPT_COOKIEJAR      => '',
        ]);

        $this->html = curl_exec($ch);
        $this->finalUrl = curl_getinfo($ch, CURLINFO_EFFECTIVE_URL);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        curl_close($ch);

        if ($error || $httpCode >= 400 || $this->html === false) {
            throw new RuntimeException("Fetch failed (HTTP $httpCode): $error");
        }

        return true;
    }

    public function extract(): array
    {
        $sources = [];
        $domain  = parse_url($this->finalUrl ?: $this->url, PHP_URL_HOST) ?? '';

        // Site-specific extractors first (more reliable)
        if (str_contains($domain, 'xhamster')) {
            $sources = array_merge($sources, $this->extractXhamster());
        }
        if (str_contains($domain, 'xvideos')) {
            $sources = array_merge($sources, $this->extractXvideos());
        }
        if (str_contains($domain, 'pornhub')) {
            $sources = array_merge($sources, $this->extractPornhub());
        }
        if (str_contains($domain, 'redtube')) {
            $sources = array_merge($sources, $this->extractRedtube());
        }
        if (str_contains($domain, 'youtube') || str_contains($domain, 'youtu.be')) {
            $sources = array_merge($sources, $this->extractYoutube());
        }

        // Generic extractors as fallback
        $sources = array_merge($sources, $this->extractFromVideoTags());
        $sources = array_merge($sources, $this->extractFromSourceTags());
        $sources = array_merge($sources, $this->extractFromMetaTags());
        $sources = array_merge($sources, $this->extractFromJsonLd());
        $sources = array_merge($sources, $this->extractFromJsPatterns());
        $sources = array_merge($sources, $this->extractM3u8());

        // Deduplicate by URL
        $seen = [];
        $unique = [];
        foreach ($sources as $src) {
            $key = $src['url'];
            if (!isset($seen[$key])) {
                $seen[$key] = true;
                $unique[]   = $src;
            }
        }

        // Sort by quality (highest first)
        usort($unique, fn($a, $b) => $this->qualityScore($b) - $this->qualityScore($a));

        return $unique;
    }

    // -----------------------------------------------------------------------
    // Site-specific extractors
    // -----------------------------------------------------------------------

    private function extractXhamster(): array
    {
        $sources = [];

        // Pattern 1 : window.initials JSON blob
        if (preg_match('/window\.initials\s*=\s*(\{.+?\});\s*(?:window|var|let|const|<\/script)/s', $this->html, $m)) {
            $data = @json_decode($m[1], true);
            $mp4  = $data['videoInitials']['videoModel']['sources']['mp4'] ?? null;
            if (is_array($mp4)) {
                foreach ($mp4 as $quality => $url) {
                    if (filter_var($url, FILTER_VALIDATE_URL)) {
                        $sources[] = ['url' => $url, 'quality' => $quality, 'format' => 'mp4', 'source' => 'xhamster'];
                    }
                }
            }
            // HLS
            $hls = $data['videoInitials']['videoModel']['sources']['hls'] ?? null;
            if (is_string($hls) && filter_var($hls, FILTER_VALIDATE_URL)) {
                $sources[] = ['url' => $hls, 'quality' => 'hls', 'format' => 'm3u8', 'source' => 'xhamster'];
            }
        }

        // Pattern 2 : xhvid JSON dans script
        if (preg_match('/"sources"\s*:\s*\{[^}]*"mp4"\s*:\s*(\{[^}]+\})/s', $this->html, $m)) {
            $mp4 = @json_decode($m[1], true);
            if (is_array($mp4)) {
                foreach ($mp4 as $quality => $url) {
                    if (filter_var($url, FILTER_VALIDATE_URL)) {
                        $sources[] = ['url' => $url, 'quality' => $quality, 'format' => 'mp4', 'source' => 'xhamster-js'];
                    }
                }
            }
        }

        // Pattern 3 : URL mp4 directes dans le HTML
        if (preg_match_all('/"(https?:\/\/[^"]+\.mp4[^"]*)"/', $this->html, $matches)) {
            foreach ($matches[1] as $url) {
                if (str_contains($url, 'cdn') || str_contains($url, 'media') || str_contains($url, 'video')) {
                    $sources[] = ['url' => html_entity_decode($url), 'quality' => 'unknown', 'format' => 'mp4', 'source' => 'xhamster-direct'];
                }
            }
        }

        return $sources;
    }

    private function extractXvideos(): array
    {
        $sources = [];
        // html5player.setVideoHLS('...')
        if (preg_match('/html5player\.setVideoHLS\([\'"]([^\'"]+)[\'"]\)/', $this->html, $m)) {
            $sources[] = ['url' => $m[1], 'quality' => 'hls', 'format' => 'm3u8', 'source' => 'xvideos'];
        }
        // html5player.setVideoUrlHigh / setVideoUrlLow
        foreach (['High' => '720p', 'Low' => '480p'] as $suffix => $quality) {
            if (preg_match("/html5player\.setVideoUrl{$suffix}\(['\"]([^'\"]+)['\"]\)/", $this->html, $m)) {
                $sources[] = ['url' => $m[1], 'quality' => $quality, 'format' => 'mp4', 'source' => 'xvideos'];
            }
        }
        return $sources;
    }

    private function extractPornhub(): array
    {
        $sources = [];
        // flashvars_
        if (preg_match('/var flashvars_\d+\s*=\s*(\{.+?\});/s', $this->html, $m)) {
            $data     = @json_decode($m[1], true);
            $mediaArr = $data['mediaDefinitions'] ?? [];
            foreach ($mediaArr as $media) {
                if (!empty($media['videoUrl']) && filter_var($media['videoUrl'], FILTER_VALIDATE_URL)) {
                    $quality   = $media['quality'] ?? 'unknown';
                    $sources[] = ['url' => $media['videoUrl'], 'quality' => $quality . 'p', 'format' => 'mp4', 'source' => 'pornhub'];
                }
            }
        }
        return $sources;
    }

    private function extractRedtube(): array
    {
        $sources = [];
        if (preg_match_all('/"videoUrl"\s*:\s*"([^"]+\.mp4[^"]*)"/', $this->html, $m)) {
            foreach ($m[1] as $url) {
                $sources[] = ['url' => stripslashes($url), 'quality' => 'unknown', 'format' => 'mp4', 'source' => 'redtube'];
            }
        }
        return $sources;
    }

    private function extractYoutube(): array
    {
        // For YouTube, suggest using yt-dlp
        return [['url' => '', 'quality' => 'n/a', 'format' => 'n/a',
            'source' => 'youtube', 'note' => 'YouTube requires yt-dlp. Run: yt-dlp ' . $this->url]];
    }

    // -----------------------------------------------------------------------
    // Generic extractors
    // -----------------------------------------------------------------------

    private function extractFromVideoTags(): array
    {
        $sources = [];
        if (preg_match_all('/<video[^>]+src=["\']([^"\']+)["\'][^>]*>/i', $this->html, $m)) {
            foreach ($m[1] as $url) {
                $url = $this->resolveUrl($url);
                if ($url) {
                    $sources[] = ['url' => $url, 'quality' => 'unknown', 'format' => $this->guessFormat($url), 'source' => 'video-tag'];
                }
            }
        }
        return $sources;
    }

    private function extractFromSourceTags(): array
    {
        $sources = [];
        if (preg_match_all('/<source[^>]+src=["\']([^"\']+)["\'][^>]*>/i', $this->html, $matches, PREG_SET_ORDER)) {
            foreach ($matches as $m) {
                $url = $this->resolveUrl($m[1]);
                if ($url) {
                    $label     = '';
                    $format    = $this->guessFormat($url);
                    $quality   = $label ?: 'unknown';
                    $sources[] = ['url' => $url, 'quality' => $quality, 'format' => $format, 'source' => 'source-tag'];
                }
            }
        }
        return $sources;
    }

    private function extractFromMetaTags(): array
    {
        $sources = [];
        // og:video
        if (preg_match('/<meta[^>]+(?:property=["\']og:video(?::url)?["\']|name=["\']og:video["\'])[^>]+content=["\']([^"\']+)["\'][^>]*>/i', $this->html, $m)) {
            $url = $this->resolveUrl(html_entity_decode($m[1]));
            if ($url) {
                $sources[] = ['url' => $url, 'quality' => 'unknown', 'format' => $this->guessFormat($url), 'source' => 'og:video'];
            }
        }
        // twitter:player:stream
        if (preg_match('/<meta[^>]+name=["\']twitter:player:stream["\'][^>]+content=["\']([^"\']+)["\'][^>]*>/i', $this->html, $m)) {
            $url = $this->resolveUrl(html_entity_decode($m[1]));
            if ($url) {
                $sources[] = ['url' => $url, 'quality' => 'unknown', 'format' => $this->guessFormat($url), 'source' => 'twitter:player'];
            }
        }
        return $sources;
    }

    private function extractFromJsonLd(): array
    {
        $sources = [];
        if (preg_match_all('/<script[^>]+type=["\']application\/ld\+json["\'][^>]*>(.+?)<\/script>/is', $this->html, $matches)) {
            foreach ($matches[1] as $json) {
                $data = @json_decode($json, true);
                if (!is_array($data)) continue;
                // Flatten nested @graph
                $items = isset($data['@graph']) ? $data['@graph'] : [$data];
                foreach ($items as $item) {
                    foreach (['contentUrl', 'embedUrl', 'url'] as $key) {
                        if (!empty($item[$key]) && $this->isVideoUrl($item[$key])) {
                            $sources[] = ['url' => $item[$key], 'quality' => 'unknown', 'format' => $this->guessFormat($item[$key]), 'source' => 'json-ld'];
                        }
                    }
                }
            }
        }
        return $sources;
    }

    private function extractFromJsPatterns(): array
    {
        $sources = [];

        // Common JS patterns
        $patterns = [
            // Generic sources array: sources:[{src:"...",type:"video/mp4"}]
            '/["\']?src["\']?\s*:\s*["\']([^"\']+\.(?:mp4|webm|ogg|m3u8)[^"\']*)["\']/',
            // file: "url"
            '/["\']?file["\']?\s*:\s*["\']([^"\']+\.(?:mp4|webm|m3u8)[^"\']*)["\']/',
            // videoUrl: "..."
            '/["\']?videoUrl["\']?\s*:\s*["\']([^"\']+)["\']/',
            // video_url: "..."
            '/["\']?video_url["\']?\s*:\s*["\']([^"\']+)["\']/',
            // mp4: "..."
            '/"mp4"\s*:\s*"([^"]+\.mp4[^"]*)"/',
            // hls: "..."
            '/"hls"\s*:\s*"([^"]+\.m3u8[^"]*)"/',
        ];

        foreach ($patterns as $pattern) {
            if (preg_match_all($pattern, $this->html, $m)) {
                foreach ($m[1] as $url) {
                    $url = stripslashes(html_entity_decode($url));
                    $url = $this->resolveUrl($url);
                    if ($url && $this->isVideoUrl($url)) {
                        $sources[] = ['url' => $url, 'quality' => 'unknown', 'format' => $this->guessFormat($url), 'source' => 'js-pattern'];
                    }
                }
            }
        }
        return $sources;
    }

    private function extractM3u8(): array
    {
        $sources = [];
        if (preg_match_all('/["\']?(https?:\/\/[^"\'<>\s]+\.m3u8[^"\'<>\s]*)["\']?/i', $this->html, $m)) {
            foreach ($m[1] as $url) {
                $url = html_entity_decode($url);
                if (filter_var($url, FILTER_VALIDATE_URL)) {
                    $sources[] = ['url' => $url, 'quality' => 'hls', 'format' => 'm3u8', 'source' => 'm3u8-scan'];
                }
            }
        }
        return $sources;
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    private function resolveUrl(string $url): string
    {
        $url = trim($url);
        if (empty($url)) return '';
        if (str_starts_with($url, 'http://') || str_starts_with($url, 'https://')) {
            return filter_var($url, FILTER_VALIDATE_URL) ? $url : '';
        }
        if (str_starts_with($url, '//')) {
            $scheme = parse_url($this->url, PHP_URL_SCHEME) ?? 'https';
            return $scheme . ':' . $url;
        }
        if (str_starts_with($url, '/')) {
            $base = parse_url($this->url, PHP_URL_SCHEME) . '://' . parse_url($this->url, PHP_URL_HOST);
            return $base . $url;
        }
        return '';
    }

    private function guessFormat(string $url): string
    {
        $path = strtolower(parse_url($url, PHP_URL_PATH) ?? '');
        foreach (['mp4', 'm3u8', 'webm', 'ogg', 'avi', 'mov', 'mkv', 'flv'] as $ext) {
            if (str_ends_with($path, '.' . $ext)) return $ext;
        }
        if (str_contains($url, '.m3u8')) return 'm3u8';
        return 'unknown';
    }

    private function isVideoUrl(string $url): bool
    {
        if (!filter_var($url, FILTER_VALIDATE_URL)) return false;
        $lower = strtolower($url);
        $videoExts = ['mp4', 'm3u8', 'webm', 'ogg', 'avi', 'mov', 'mkv', 'flv', 'ts'];
        foreach ($videoExts as $ext) {
            if (str_contains($lower, '.' . $ext)) return true;
        }
        return false;
    }

    private function qualityScore(array $src): int
    {
        $q = strtolower($src['quality'] ?? '');
        $map = ['2160p' => 90, '4k' => 90, '1080p' => 80, '720p' => 70, '480p' => 50, '360p' => 40, '240p' => 30, 'hls' => 60, 'hd' => 75, 'sd' => 45];
        foreach ($map as $key => $score) {
            if (str_contains($q, $key)) return $score;
        }
        return 20;
    }

    public function getTitle(): string
    {
        if (preg_match('/<title[^>]*>([^<]+)<\/title>/i', $this->html, $m)) {
            return html_entity_decode(trim($m[1]), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        }
        return '';
    }

    public function getThumbnail(): string
    {
        if (preg_match('/<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\'][^>]*>/i', $this->html, $m)) {
            return html_entity_decode($m[1]);
        }
        return '';
    }
}
