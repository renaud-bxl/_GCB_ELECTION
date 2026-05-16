<?php

declare(strict_types=1);

class VideoExtractor
{
    private string $url;
    private string $html    = '';
    private string $finalUrl = '';
    private array  $iframeHtml = [];

    private const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

    private const VIDEO_EXTS  = ['mp4','webm','ogg','avi','mov','mkv','flv','ts','m4v','wmv','3gp'];
    private const STREAM_EXTS = ['m3u8','mpd'];

    public function __construct(string $url)
    {
        $this->url = $url;
    }

    // -----------------------------------------------------------------------
    // HTTP helpers
    // -----------------------------------------------------------------------

    private function fetchUrl(string $url, array $extraHeaders = [], bool $headOnly = false): array
    {
        $ch = curl_init();
        $respHeaders = [];
        curl_setopt_array($ch, [
            CURLOPT_URL            => $url,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS      => 5,
            CURLOPT_TIMEOUT        => $headOnly ? 10 : 30,
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_SSL_VERIFYHOST => false,
            CURLOPT_ENCODING       => 'gzip, deflate, br',
            CURLOPT_USERAGENT      => self::UA,
            CURLOPT_NOBODY         => $headOnly,
            CURLOPT_HTTPHEADER     => array_merge([
                'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language: fr-FR,fr;q=0.9,en;q=0.8',
                'DNT: 1',
                'Upgrade-Insecure-Requests: 1',
                'Sec-Fetch-Dest: document',
                'Sec-Fetch-Mode: navigate',
                'Cache-Control: max-age=0',
            ], $extraHeaders),
            CURLOPT_HEADERFUNCTION => function ($ch, $header) use (&$respHeaders) {
                $respHeaders[] = trim($header);
                return strlen($header);
            },
            CURLOPT_COOKIEFILE => '',
            CURLOPT_COOKIEJAR  => '',
        ]);
        $body = curl_exec($ch);
        $info = curl_getinfo($ch);
        $err  = curl_error($ch);
        curl_close($ch);

        if ($err || $body === false) throw new RuntimeException("cURL error: $err");
        if ($info['http_code'] >= 400) throw new RuntimeException("HTTP {$info['http_code']} for $url");

        return ['body' => (string)$body, 'headers' => $respHeaders, 'info' => $info];
    }

    public function fetch(): void
    {
        $res = $this->fetchUrl($this->url);
        $this->html     = $res['body'];
        $this->finalUrl = $res['info']['url'];
        $this->fetchIframes();
    }

    private function fetchIframes(): void
    {
        preg_match_all('/<iframe[^>]+src=["\']([^"\']+)["\'][^>]*>/i', $this->html, $m);
        $videoHosts = [
            'youtube','vimeo','dailymotion','streamable','rumble','odysee','twitch',
            'xhamster','xvideos','pornhub','redtube','xnxx','spankbang','eporner',
            'tnaflix','beeg','tube8','youporn','drtuber','hclips','txxx','vjav',
            'jwplatform','brightcove','kaltura','wistia','vidyard','loom',
            'vk.com','ok.ru','bilibili','nicovideo','twitter','instagram',
        ];
        $count = 0;
        foreach ($m[1] as $src) {
            if ($count >= 3) break;
            $src  = $this->resolveUrl($src);
            if (!$src) continue;
            $host = strtolower(parse_url($src, PHP_URL_HOST) ?? '');
            $ok   = false;
            foreach ($videoHosts as $vh) { if (str_contains($host, $vh)) { $ok = true; break; } }
            if (!$ok) continue;
            try {
                $res = $this->fetchUrl($src, ['Referer: ' . $this->finalUrl]);
                $this->iframeHtml[] = $res['body'];
                $count++;
            } catch (Throwable) {}
        }
    }

    // -----------------------------------------------------------------------
    // Main entry point
    // -----------------------------------------------------------------------

    public function extract(): array
    {
        $allHtml = [$this->html, ...$this->iframeHtml];
        $sources = [];
        $domain  = strtolower(parse_url($this->finalUrl ?: $this->url, PHP_URL_HOST) ?? '');

        foreach ($allHtml as $html) {
            // ---- Adult / tube sites
            if (str_contains($domain, 'xhamster'))    $sources = array_merge($sources, $this->xhamster($html));
            if (str_contains($domain, 'xvideos'))     $sources = array_merge($sources, $this->xvideos($html));
            if (str_contains($domain, 'pornhub'))     $sources = array_merge($sources, $this->pornhub($html));
            if (str_contains($domain, 'redtube'))     $sources = array_merge($sources, $this->redtube($html));
            if (str_contains($domain, 'xnxx'))        $sources = array_merge($sources, $this->xnxx($html));
            if (str_contains($domain, 'spankbang'))   $sources = array_merge($sources, $this->spankbang($html));
            if (str_contains($domain, 'eporner'))     $sources = array_merge($sources, $this->eporner($html));
            if (str_contains($domain, 'tnaflix'))     $sources = array_merge($sources, $this->tnaflix($html));
            if (str_contains($domain, 'beeg'))        $sources = array_merge($sources, $this->beeg($html));
            if (str_contains($domain, 'tube8'))       $sources = array_merge($sources, $this->tube8($html));
            if (str_contains($domain, 'youporn'))     $sources = array_merge($sources, $this->youporn($html));
            if (str_contains($domain, 'drtuber'))     $sources = array_merge($sources, $this->drtuber($html));
            if (str_contains($domain, 'hclips'))      $sources = array_merge($sources, $this->hclips($html));
            if (str_contains($domain, 'txxx'))        $sources = array_merge($sources, $this->txxx($html));
            if (str_contains($domain, 'vjav'))        $sources = array_merge($sources, $this->vjav($html));
            if (str_contains($domain, 'upornia'))     $sources = array_merge($sources, $this->upornia($html));
            if (str_contains($domain, 'motherless'))  $sources = array_merge($sources, $this->motherless($html));
            if (str_contains($domain, 'rule34video')) $sources = array_merge($sources, $this->rule34video($html));
            if (str_contains($domain, 'empflix')
             || str_contains($domain, 'tnaflix'))     $sources = array_merge($sources, $this->tnaflix($html));

            // ---- Mainstream / social
            if (str_contains($domain, 'dailymotion')) $sources = array_merge($sources, $this->dailymotion($html));
            if (str_contains($domain, 'vimeo'))       $sources = array_merge($sources, $this->vimeo($html));
            if (str_contains($domain, 'streamable'))  $sources = array_merge($sources, $this->streamable($html));
            if (str_contains($domain, 'rumble'))      $sources = array_merge($sources, $this->rumble($html));
            if (str_contains($domain, 'odysee')
             || str_contains($domain, 'lbry'))        $sources = array_merge($sources, $this->odysee($html));
            if (str_contains($domain, 'twitch'))      $sources = array_merge($sources, $this->twitch());
            if (str_contains($domain, 'vk.com'))      $sources = array_merge($sources, $this->vk($html));
            if (str_contains($domain, 'ok.ru'))       $sources = array_merge($sources, $this->okru($html));
            if (str_contains($domain, 'bilibili'))    $sources = array_merge($sources, $this->bilibili());
            if (str_contains($domain, 'nicovideo'))   $sources = array_merge($sources, $this->niconico());
            if (str_contains($domain, 'youtube')
             || str_contains($domain, 'youtu.be'))    $sources = array_merge($sources, $this->youtube());
            if (str_contains($domain, 'twitter')
             || str_contains($domain, 'x.com'))       $sources = array_merge($sources, $this->twitter($html));
            if (str_contains($domain, 'facebook')
             || str_contains($domain, 'fb.watch'))    $sources = array_merge($sources, $this->facebook($html));
            if (str_contains($domain, 'instagram'))   $sources = array_merge($sources, $this->instagram($html));
            if (str_contains($domain, 'tiktok'))      $sources = array_merge($sources, $this->tiktok($html));

            // ---- Video player engines
            $sources = array_merge($sources,
                $this->jwplayer($html),
                $this->videojs($html),
                $this->flowplayer($html),
                $this->brightcove($html),
                $this->kaltura($html),
                $this->wistia($html),
                $this->plyr($html),
                $this->html5player($html),
                $this->dashPlayer($html)
            );

            // ---- Generic fallbacks
            $sources = array_merge($sources,
                $this->extractVideoTags($html),
                $this->extractSourceTags($html),
                $this->extractMetaTags($html),
                $this->extractJsonLd($html),
                $this->extractJsPatterns($html),
                $this->extractDirectUrls($html),
                $this->extractM3u8($html),
                $this->extractMpd($html)
            );
        }

        return $this->dedupe($sources);
    }

    // -----------------------------------------------------------------------
    // Site-specific extractors
    // -----------------------------------------------------------------------

    private function xhamster(string $html): array
    {
        $s = [];
        // window.initials JSON
        foreach ([
            '/window\.initials\s*=\s*(\{.+?\});\s*(?:window|<\/script)/s',
            '/window\.initials\s*=\s*(\{.+\})\s*;?\s*$/m',
        ] as $pat) {
            if (preg_match($pat, $html, $m)) {
                $data = @json_decode($m[1], true);
                $mp4  = $data['videoInitials']['videoModel']['sources']['mp4'] ?? null;
                if (is_array($mp4)) {
                    foreach ($mp4 as $q => $url) {
                        if ($this->validUrl($url)) $s[] = $this->src($url, $q, 'mp4', 'xhamster');
                    }
                }
                $hls = $data['videoInitials']['videoModel']['sources']['hls'] ?? null;
                if (is_string($hls) && $this->validUrl($hls))
                    $s[] = $this->src($hls, 'hls', 'm3u8', 'xhamster');
            }
        }
        // "sources":{"mp4":{...}}
        if (preg_match('/"sources"\s*:\s*\{[^}]*"mp4"\s*:\s*(\{[^}]+\})/s', $html, $m)) {
            $mp4 = @json_decode($m[1], true);
            if (is_array($mp4)) {
                foreach ($mp4 as $q => $url) {
                    if ($this->validUrl($url)) $s[] = $this->src($url, $q, 'mp4', 'xhamster');
                }
            }
        }
        // CDN MP4 direct URLs
        if (preg_match_all('/"(https?:\/\/[^"]*cdn[^"]*\.mp4[^"]*)"/', $html, $m)) {
            foreach ($m[1] as $url) $s[] = $this->src(html_entity_decode($url), 'unknown', 'mp4', 'xhamster-cdn');
        }
        return $s;
    }

    private function xvideos(string $html): array
    {
        $s = [];
        if (preg_match('/html5player\.setVideoHLS\([\'"]([^\'"]+)[\'"]\)/', $html, $m))
            $s[] = $this->src($m[1], 'hls', 'm3u8', 'xvideos');
        foreach (['High' => '720p', 'Low' => '480p', 'Med' => '360p'] as $sfx => $q) {
            if (preg_match("/html5player\.setVideoUrl{$sfx}\(['\"]([^'\"]+)['\"]\)/", $html, $m))
                $s[] = $this->src($m[1], $q, 'mp4', 'xvideos');
        }
        if (preg_match_all('/html5player\.setVideoUrl[A-Za-z]*\([\'"]([^\'"]+)[\'"]\)/', $html, $m)) {
            foreach ($m[1] as $url) $s[] = $this->src($url, 'unknown', $this->guessExt($url), 'xvideos');
        }
        return $s;
    }

    private function pornhub(string $html): array
    {
        $s = [];
        if (preg_match('/var flashvars_\d+\s*=\s*(\{.+?\});\s*(?:var|<\/script)/s', $html, $m)) {
            $data = @json_decode($m[1], true);
            foreach ($data['mediaDefinitions'] ?? [] as $def) {
                if (!empty($def['videoUrl']) && $this->validUrl($def['videoUrl'])) {
                    $q   = isset($def['quality']) ? $def['quality'] . 'p' : 'unknown';
                    $s[] = $this->src($def['videoUrl'], $q, $this->guessExt($def['videoUrl']), 'pornhub');
                }
            }
        }
        return $s;
    }

    private function redtube(string $html): array
    {
        $s = [];
        if (preg_match_all('/"videoUrl"\s*:\s*"([^"]+\.mp4[^"]*)"/', $html, $m)) {
            foreach ($m[1] as $url) $s[] = $this->src(stripslashes($url), 'unknown', 'mp4', 'redtube');
        }
        if (preg_match('/sources\s*:\s*(\[.+?\])/s', $html, $m)) {
            $arr = @json_decode($m[1], true);
            foreach ((array)$arr as $item) {
                if (!empty($item['src']) && $this->validUrl($item['src']))
                    $s[] = $this->src($item['src'], $item['res'] ?? 'unknown', $this->guessExt($item['src']), 'redtube');
            }
        }
        return $s;
    }

    private function xnxx(string $html): array
    {
        $s = [];
        if (preg_match('/html5player\.setVideoHLS\([\'"]([^\'"]+)[\'"]\)/', $html, $m))
            $s[] = $this->src($m[1], 'hls', 'm3u8', 'xnxx');
        foreach (['High' => '720p', 'Low' => '480p'] as $sfx => $q) {
            if (preg_match("/html5player\.setVideoUrl{$sfx}\(['\"]([^'\"]+)['\"]\)/", $html, $m))
                $s[] = $this->src($m[1], $q, 'mp4', 'xnxx');
        }
        return $s;
    }

    private function spankbang(string $html): array
    {
        $s = [];
        if (preg_match_all('/stream_url(?:_[a-z0-9]+)?\s*=\s*["\']([^"\']+)["\']/', $html, $m)) {
            foreach ($m[1] as $url) {
                if ($this->validUrl($url)) $s[] = $this->src($url, 'unknown', $this->guessExt($url), 'spankbang');
            }
        }
        if (preg_match('/"streams"\s*:\s*(\{.+?\})/s', $html, $m)) {
            $data = @json_decode($m[1], true);
            foreach ((array)$data as $q => $url) {
                if ($this->validUrl($url)) $s[] = $this->src($url, $q, $this->guessExt($url), 'spankbang');
            }
        }
        return $s;
    }

    private function eporner(string $html): array
    {
        $s = [];
        if (preg_match_all('/["\']?(https?:\/\/[^"\'<>\s]+eporner[^"\'<>\s]+\.mp4[^"\'<>\s]*)["\']?/i', $html, $m)) {
            foreach ($m[1] as $url) $s[] = $this->src(html_entity_decode($url), 'unknown', 'mp4', 'eporner');
        }
        if (preg_match('/sources\s*:\s*\[(.+?)\]/s', $html, $m)) $this->parseSourcesArr($m[1], $s, 'eporner');
        return $s;
    }

    private function tnaflix(string $html): array
    {
        $s = [];
        if (preg_match('/config\s*=\s*(\{.+?"sources".+?\})/s', $html, $m)) {
            $data = @json_decode($m[1], true);
            foreach ($data['sources'] ?? [] as $src) {
                if (!empty($src['file']) && $this->validUrl($src['file']))
                    $s[] = $this->src($src['file'], $src['label'] ?? 'unknown', $this->guessExt($src['file']), 'tnaflix');
            }
        }
        return $s;
    }

    private function beeg(string $html): array
    {
        $s = [];
        if (preg_match('/videoSources\s*:\s*(\[.+?\])/s', $html, $m)) {
            $arr = @json_decode($m[1], true);
            foreach ((array)$arr as $item) {
                $url = $item['src'] ?? $item['url'] ?? '';
                if ($this->validUrl($url))
                    $s[] = $this->src($url, $item['res'] ?? $item['label'] ?? 'unknown', $this->guessExt($url), 'beeg');
            }
        }
        return $s;
    }

    private function tube8(string $html): array
    {
        $s = [];
        if (preg_match('/var flashvars\s*=\s*(\{.+?\});/s', $html, $m)) {
            $data = @json_decode($m[1], true);
            if (!empty($data['video_url']) && $this->validUrl($data['video_url']))
                $s[] = $this->src($data['video_url'], 'unknown', $this->guessExt($data['video_url']), 'tube8');
        }
        return $s;
    }

    private function youporn(string $html): array
    {
        $s = [];
        if (preg_match('/mediaDefinition\s*[=:]\s*(\[.+?\])/s', $html, $m)) {
            $arr = @json_decode($m[1], true);
            foreach ((array)$arr as $def) {
                $url = $def['videoUrl'] ?? $def['url'] ?? '';
                if ($this->validUrl($url))
                    $s[] = $this->src($url, ($def['quality'] ?? 'unknown') . 'p', $this->guessExt($url), 'youporn');
            }
        }
        return $s;
    }

    private function drtuber(string $html): array
    {
        $s = [];
        if (preg_match_all('/["\']file["\']\s*:\s*["\']([^"\']+\.mp4[^"\']*)["\']/', $html, $m)) {
            foreach ($m[1] as $url) $s[] = $this->src(stripslashes($url), 'unknown', 'mp4', 'drtuber');
        }
        return $s;
    }

    private function hclips(string $html): array
    {
        $s = [];
        if (preg_match('/sources\s*:\s*(\[.+?\])/s', $html, $m)) $this->parseSourcesArr($m[1], $s, 'hclips');
        return $s;
    }

    private function txxx(string $html): array
    {
        $s = [];
        if (preg_match('/var\s+video_url\s*=\s*["\']([^"\']+)["\']/', $html, $m))
            $s[] = $this->src(stripslashes($m[1]), 'unknown', $this->guessExt($m[1]), 'txxx');
        return $s;
    }

    private function vjav(string $html): array
    {
        $s = [];
        if (preg_match('/sources\s*:\s*(\[.+?\])/s', $html, $m)) $this->parseSourcesArr($m[1], $s, 'vjav');
        return $s;
    }

    private function upornia(string $html): array
    {
        $s = [];
        if (preg_match('/var\s+flashvars\s*=\s*(\{.+?\});/s', $html, $m)) {
            $data = @json_decode($m[1], true);
            foreach (['video_url','video_alt_url','video_url_text','video_alt_url_text'] as $k) {
                if (!empty($data[$k]) && $this->validUrl($data[$k]))
                    $s[] = $this->src($data[$k], 'unknown', $this->guessExt($data[$k]), 'upornia');
            }
        }
        return $s;
    }

    private function motherless(string $html): array
    {
        $s = [];
        if (preg_match('/type:\'video\/mp4\',\s*src:\'([^\']+)\'/', $html, $m))
            $s[] = $this->src($m[1], 'unknown', 'mp4', 'motherless');
        if (preg_match('/file\s*:\s*["\']([^"\']+\.mp4[^"\']*)["\']/', $html, $m))
            $s[] = $this->src($m[1], 'unknown', 'mp4', 'motherless');
        return $s;
    }

    private function rule34video(string $html): array
    {
        $s = [];
        if (preg_match_all('/<source[^>]+src=["\']([^"\']+\.mp4[^"\']*)["\'][^>]*>/i', $html, $m)) {
            foreach ($m[1] as $url) {
                $url = $this->resolveUrl($url);
                if ($url) $s[] = $this->src($url, 'unknown', 'mp4', 'rule34video');
            }
        }
        return $s;
    }

    private function dailymotion(string $html): array
    {
        $s = [];
        if (preg_match('/"qualities"\s*:\s*(\{.+?\})\s*,\s*"[a-z]/s', $html, $m)) {
            $data = @json_decode($m[1], true);
            foreach ((array)$data as $quality => $streams) {
                foreach ((array)$streams as $stream) {
                    $url = $stream['url'] ?? '';
                    if ($this->validUrl($url)) $s[] = $this->src($url, $quality, $this->guessExt($url), 'dailymotion');
                }
            }
        }
        if (preg_match('/"hls"\s*:\s*\{"url"\s*:\s*"([^"]+)"/i', $html, $m))
            $s[] = $this->src(stripslashes($m[1]), 'hls', 'm3u8', 'dailymotion');
        if (preg_match('/"progressive"\s*:\s*(\[.+?\])/s', $html, $m)) {
            $arr = @json_decode($m[1], true);
            foreach ((array)$arr as $item) {
                if (!empty($item['url']) && $this->validUrl($item['url']))
                    $s[] = $this->src($item['url'], $item['quality'] ?? 'unknown', $this->guessExt($item['url']), 'dailymotion');
            }
        }
        return $s;
    }

    private function vimeo(string $html): array
    {
        $s = [];
        if (preg_match('/"progressive"\s*:\s*(\[.+?\])/s', $html, $m)) {
            $arr = @json_decode($m[1], true);
            foreach ((array)$arr as $item) {
                if (!empty($item['url']) && $this->validUrl($item['url']))
                    $s[] = $this->src($item['url'], $item['quality'] ?? 'unknown', 'mp4', 'vimeo');
            }
        }
        if (preg_match('/"hls"\s*:\s*\{[^}]*"url"\s*:\s*"([^"]+)"/s', $html, $m))
            $s[] = $this->src(stripslashes($m[1]), 'hls', 'm3u8', 'vimeo');
        if (preg_match('/var\s+config\s*=\s*(\{.+?\});\s*(?:if|var)/s', $html, $m)) {
            $data = @json_decode($m[1], true);
            foreach ($data['request']['files']['progressive'] ?? [] as $item) {
                if (!empty($item['url'])) $s[] = $this->src($item['url'], $item['quality'] ?? 'unknown', 'mp4', 'vimeo');
            }
        }
        return $s;
    }

    private function streamable(string $html): array
    {
        $s = [];
        if (preg_match('/"mp4"\s*:\s*\{"url"\s*:\s*"([^"]+)"/i', $html, $m))
            $s[] = $this->src(stripslashes($m[1]), 'unknown', 'mp4', 'streamable');
        if (preg_match_all('/"url"\s*:\s*"(https?:[^"]+\.mp4[^"]*)"/', $html, $m)) {
            foreach ($m[1] as $url) $s[] = $this->src(stripslashes($url), 'unknown', 'mp4', 'streamable');
        }
        return $s;
    }

    private function rumble(string $html): array
    {
        $s = [];
        if (preg_match('/"ua"\s*:\s*(\{.+?\})\s*[,}]/s', $html, $m)) {
            $data = @json_decode($m[1], true);
            foreach ((array)$data as $quality => $info) {
                $url = $info['url'] ?? '';
                if ($this->validUrl($url)) $s[] = $this->src($url, $quality, $this->guessExt($url), 'rumble');
            }
        }
        return $s;
    }

    private function odysee(string $html): array
    {
        $s = [];
        if (preg_match('/"streaming_url"\s*:\s*"([^"]+)"/i', $html, $m))
            $s[] = $this->src(stripslashes($m[1]), 'unknown', $this->guessExt($m[1]), 'odysee');
        if (preg_match('/source\s*:\s*["\']([^"\']+\.m3u8[^"\']*)["\']/', $html, $m))
            $s[] = $this->src($m[1], 'hls', 'm3u8', 'odysee');
        return $s;
    }

    private function twitch(): array
    {
        return [['url'=>'','quality'=>'n/a','format'=>'n/a','source'=>'twitch',
            'note'=>'Twitch nécessite yt-dlp : yt-dlp ' . $this->url]];
    }

    private function vk(string $html): array
    {
        $s = [];
        if (preg_match_all('/"url(\d+)"\s*:\s*"([^"]+\.mp4[^"]*)"/', $html, $m, PREG_SET_ORDER)) {
            foreach ($m as $match) $s[] = $this->src(stripslashes($match[2]), $match[1].'p', 'mp4', 'vk');
        }
        return $s;
    }

    private function okru(string $html): array
    {
        $s = [];
        if (preg_match('/"videos"\s*:\s*(\[.+?\])/s', $html, $m)) {
            $arr = @json_decode($m[1], true);
            foreach ((array)$arr as $item) {
                $url = $item['url'] ?? '';
                if ($this->validUrl($url))
                    $s[] = $this->src($url, $item['name'] ?? 'unknown', $this->guessExt($url), 'ok.ru');
            }
        }
        return $s;
    }

    private function bilibili(): array
    {
        return [['url'=>'','quality'=>'n/a','format'=>'n/a','source'=>'bilibili',
            'note'=>'Bilibili nécessite yt-dlp : yt-dlp ' . $this->url]];
    }

    private function niconico(): array
    {
        return [['url'=>'','quality'=>'n/a','format'=>'n/a','source'=>'niconico',
            'note'=>'NicoNico nécessite yt-dlp : yt-dlp ' . $this->url]];
    }

    private function youtube(): array
    {
        return [['url'=>'','quality'=>'n/a','format'=>'n/a','source'=>'youtube',
            'note'=>'YouTube nécessite yt-dlp : yt-dlp ' . $this->url]];
    }

    private function twitter(string $html): array
    {
        $s = [];
        if (preg_match('/"variants"\s*:\s*(\[.+?\])/s', $html, $m)) {
            $arr = @json_decode($m[1], true);
            foreach ((array)$arr as $v) {
                $url = $v['url'] ?? '';
                if ($this->validUrl($url)) {
                    $q   = isset($v['bitrate']) ? round($v['bitrate']/1000).'k' : 'unknown';
                    $s[] = $this->src($url, $q, $this->guessExt($url), 'twitter');
                }
            }
        }
        if (empty($s))
            $s[] = ['url'=>'','quality'=>'n/a','format'=>'n/a','source'=>'twitter',
                'note'=>'Twitter/X nécessite yt-dlp : yt-dlp ' . $this->url];
        return $s;
    }

    private function facebook(string $html): array
    {
        $s = [];
        foreach (['hd_src','sd_src'] as $k) {
            if (preg_match('/"'.$k.'"\s*:\s*"([^"]+)"/', $html, $m)) {
                $url = stripslashes($m[1]);
                if ($this->validUrl($url)) $s[] = $this->src($url, str_replace('_src','',$k), 'mp4', 'facebook');
            }
        }
        if (preg_match_all('/"playable_url(?:_quality_hd)?"\s*:\s*"([^"]+)"/', $html, $m)) {
            foreach ($m[1] as $url) {
                $url = stripslashes($url);
                if ($this->validUrl($url)) $s[] = $this->src($url, 'unknown', 'mp4', 'facebook');
            }
        }
        return $s;
    }

    private function instagram(string $html): array
    {
        $s = [];
        if (preg_match_all('/"video_url"\s*:\s*"([^"]+)"/', $html, $m)) {
            foreach ($m[1] as $url) {
                $url = stripslashes($url);
                if ($this->validUrl($url)) $s[] = $this->src($url, 'unknown', 'mp4', 'instagram');
            }
        }
        return $s;
    }

    private function tiktok(string $html): array
    {
        $s = [];
        if (preg_match('/"downloadAddr"\s*:\s*"([^"]+)"/', $html, $m)) {
            $url = stripslashes($m[1]);
            if ($this->validUrl($url)) $s[] = $this->src($url, 'unknown', 'mp4', 'tiktok');
        }
        if (preg_match_all('/"playAddr"\s*:\s*"([^"]+)"/', $html, $m)) {
            foreach ($m[1] as $url) {
                $url = stripslashes($url);
                if ($this->validUrl($url)) $s[] = $this->src($url, 'unknown', 'mp4', 'tiktok');
            }
        }
        return $s;
    }

    // -----------------------------------------------------------------------
    // Video player engine extractors
    // -----------------------------------------------------------------------

    private function jwplayer(string $html): array
    {
        $s = [];
        // jwplayer("id").setup({...})
        if (preg_match_all('/jwplayer\s*\([^)]+\)\s*\.setup\s*\(\s*(\{.+?\})\s*\)/s', $html, $matches)) {
            foreach ($matches[1] as $json) {
                $data = @json_decode($json, true);
                foreach ($data['sources'] ?? [] as $src) {
                    $url = $src['file'] ?? $src['src'] ?? '';
                    if ($this->validUrl($url)) $s[] = $this->src($url, $src['label'] ?? 'unknown', $this->guessExt($url), 'jwplayer');
                }
                if (!empty($data['file']) && $this->validUrl($data['file']))
                    $s[] = $this->src($data['file'], 'unknown', $this->guessExt($data['file']), 'jwplayer');
                foreach ($data['playlist'] ?? [] as $item) {
                    foreach ($item['sources'] ?? [] as $src) {
                        $url = $src['file'] ?? '';
                        if ($this->validUrl($url)) $s[] = $this->src($url, $src['label'] ?? 'unknown', $this->guessExt($url), 'jwplayer');
                    }
                    if (!empty($item['file']) && $this->validUrl($item['file']))
                        $s[] = $this->src($item['file'], 'unknown', $this->guessExt($item['file']), 'jwplayer');
                }
            }
        }
        // var jwConfig / playerConfig
        if (preg_match('/var\s+(?:jwConfig|playerConfig|videoConfig|jwSetup)\s*=\s*(\{.+?\});/s', $html, $m)) {
            $data = @json_decode($m[1], true);
            foreach ($data['sources'] ?? [] as $src) {
                $url = $src['file'] ?? $src['src'] ?? '';
                if ($this->validUrl($url)) $s[] = $this->src($url, $src['label'] ?? 'unknown', $this->guessExt($url), 'jwplayer-var');
            }
            if (!empty($data['file']) && $this->validUrl($data['file']))
                $s[] = $this->src($data['file'], 'unknown', $this->guessExt($data['file']), 'jwplayer-var');
        }
        return $s;
    }

    private function videojs(string $html): array
    {
        $s = [];
        if (preg_match_all('/videojs\s*\([^,]+,\s*(\{.+?\})\s*\)/s', $html, $matches)) {
            foreach ($matches[1] as $json) {
                $data = @json_decode($json, true);
                foreach ($data['sources'] ?? [] as $src) {
                    $url = $src['src'] ?? '';
                    if ($this->validUrl($url)) $s[] = $this->src($url, $src['res'] ?? $src['label'] ?? 'unknown', $this->guessExt($url), 'videojs');
                }
            }
        }
        if (preg_match_all('/data-setup\s*=\s*["\'](\{[^"\']+\})["\']/', $html, $matches)) {
            foreach ($matches[1] as $json) {
                $data = @json_decode(html_entity_decode($json), true);
                foreach ($data['sources'] ?? [] as $src) {
                    $url = $src['src'] ?? '';
                    if ($this->validUrl($url)) $s[] = $this->src($url, 'unknown', $this->guessExt($url), 'videojs-data');
                }
            }
        }
        return $s;
    }

    private function flowplayer(string $html): array
    {
        $s = [];
        if (preg_match('/flowplayer\s*\([^,]+,\s*\{[^}]*clip\s*:\s*(\{.+?\})/s', $html, $m)) {
            $data = @json_decode($m[1], true);
            foreach ($data['sources'] ?? [['url' => $data['url'] ?? '']] as $src) {
                $url = $src['url'] ?? $src['src'] ?? '';
                if ($this->validUrl($url)) $s[] = $this->src($url, 'unknown', $this->guessExt($url), 'flowplayer');
            }
        }
        return $s;
    }

    private function brightcove(string $html): array
    {
        $s = [];
        if (preg_match_all('/bcSources\s*=\s*(\[.+?\])/s', $html, $matches)) {
            foreach ($matches[1] as $json) {
                $arr = @json_decode($json, true);
                foreach ((array)$arr as $src) {
                    $url = $src['src'] ?? '';
                    if ($this->validUrl($url)) $s[] = $this->src($url, $src['resolution'] ?? 'unknown', $this->guessExt($url), 'brightcove');
                }
            }
        }
        return $s;
    }

    private function kaltura(string $html): array
    {
        $s = [];
        if (preg_match('/kalturaIframePackageData\s*=\s*(\{.+?\});/s', $html, $m)) {
            $data    = @json_decode($m[1], true);
            $flavors = $data['entryResult']['contextData']['flavorAssets'] ?? [];
            foreach ($flavors as $f) {
                if (!empty($f['url']) && $this->validUrl($f['url']))
                    $s[] = $this->src($f['url'], ($f['height'] ?? 'unknown').'p', $this->guessExt($f['url']), 'kaltura');
            }
        }
        return $s;
    }

    private function wistia(string $html): array
    {
        $s = [];
        if (preg_match('/wistiaData\s*=\s*(\{.+?\});/s', $html, $m)
         || preg_match('/"assets"\s*:\s*(\[.+?\])/s', $html, $m)) {
            $data = @json_decode($m[1], true);
            foreach (($data['assets'] ?? (array)$data) as $asset) {
                $url = $asset['url'] ?? '';
                if ($this->validUrl($url))
                    $s[] = $this->src($url, ($asset['height'] ?? 'unknown').'p', $this->guessExt($url), 'wistia');
            }
        }
        return $s;
    }

    private function plyr(string $html): array
    {
        $s = [];
        if (preg_match('/new\s+Plyr\s*\([^,]+,\s*(\{.+?\})\s*\)/s', $html, $m)) {
            $data = @json_decode($m[1], true);
            foreach ($data['sources'] ?? [] as $src) {
                $url = $src['src'] ?? '';
                if ($this->validUrl($url))
                    $s[] = $this->src($url, $src['size'] ?? 'unknown', $this->guessExt($url), 'plyr');
            }
        }
        return $s;
    }

    private function html5player(string $html): array
    {
        $s = [];
        $patterns = [
            '/html5player\.setVideoUrl\([\'"]([^\'"]+)[\'"]\)/'     => 'unknown',
            '/html5player\.setVideoUrlHigh\([\'"]([^\'"]+)[\'"]\)/' => '720p',
            '/html5player\.setVideoUrlLow\([\'"]([^\'"]+)[\'"]\)/'  => '480p',
            '/html5player\.setVideoUrlMed\([\'"]([^\'"]+)[\'"]\)/'  => '360p',
            '/html5player\.setVideoHLS\([\'"]([^\'"]+)[\'"]\)/'     => 'hls',
        ];
        foreach ($patterns as $pat => $quality) {
            if (preg_match_all($pat, $html, $m)) {
                foreach ($m[1] as $url) {
                    if ($this->validUrl($url))
                        $s[] = $this->src($url, $quality, $quality === 'hls' ? 'm3u8' : 'mp4', 'html5player');
                }
            }
        }
        return $s;
    }

    private function dashPlayer(string $html): array
    {
        $s = [];
        if (preg_match_all('/["\']?(https?:\/\/[^"\'<>\s]+\.mpd[^"\'<>\s]*)["\']?/i', $html, $m)) {
            foreach ($m[1] as $url) {
                if ($this->validUrl($url)) $s[] = $this->src($url, 'dash', 'mpd', 'dash');
            }
        }
        return $s;
    }

    // -----------------------------------------------------------------------
    // Generic extractors
    // -----------------------------------------------------------------------

    private function extractVideoTags(string $html): array
    {
        $s = [];
        if (preg_match_all('/<video[^>]+src=["\']([^"\']+)["\'][^>]*>/i', $html, $m)) {
            foreach ($m[1] as $url) {
                $url = $this->resolveUrl($url);
                if ($url) $s[] = $this->src($url, 'unknown', $this->guessExt($url), 'video-tag');
            }
        }
        return $s;
    }

    private function extractSourceTags(string $html): array
    {
        $s = [];
        if (preg_match_all('/<source([^>]+)>/i', $html, $tags)) {
            foreach ($tags[1] as $attrs) {
                if (preg_match('/src=["\']([^"\']+)["\']/', $attrs, $sm)) {
                    $url = $this->resolveUrl($sm[1]);
                    if (!$url) continue;
                    $label = '';
                    if (preg_match('/(?:label|res|size)=["\']([^"\']+)["\']/', $attrs, $lm)) $label = $lm[1];
                    $s[] = $this->src($url, $label ?: 'unknown', $this->guessExt($url), 'source-tag');
                }
            }
        }
        return $s;
    }

    private function extractMetaTags(string $html): array
    {
        $s = [];
        $metas = [
            '/property=["\']og:video(?::url)?["\']/i' => 'og:video',
            '/name=["\']twitter:player:stream["\']/i'  => 'twitter:player',
            '/property=["\']video:url["\']/i'          => 'video:url',
        ];
        foreach ($metas as $detect => $label) {
            if (preg_match("/<meta[^>]+{$detect}[^>]+content=[\"']([^\"']+)[\"'][^>]*>/i", $html, $m)
             || preg_match("/<meta[^>]+content=[\"']([^\"']+)[\"'][^>]+{$detect}[^>]*>/i", $html, $m)) {
                $url = $this->resolveUrl(html_entity_decode($m[1]));
                if ($url && $this->isVideoUrl($url)) $s[] = $this->src($url, 'unknown', $this->guessExt($url), $label);
            }
        }
        return $s;
    }

    private function extractJsonLd(string $html): array
    {
        $s = [];
        if (preg_match_all('/<script[^>]+type=["\']application\/ld\+json["\'][^>]*>(.+?)<\/script>/is', $html, $matches)) {
            foreach ($matches[1] as $json) {
                $data  = @json_decode($json, true);
                $items = isset($data['@graph']) ? $data['@graph'] : [$data];
                foreach ($items as $item) {
                    foreach (['contentUrl','embedUrl','url'] as $k) {
                        if (!empty($item[$k]) && $this->isVideoUrl($item[$k]))
                            $s[] = $this->src($item[$k], 'unknown', $this->guessExt($item[$k]), 'json-ld');
                    }
                }
            }
        }
        return $s;
    }

    private function extractJsPatterns(string $html): array
    {
        $s = [];
        $patterns = [
            '/["\']?(?:src|file|url|videoUrl|video_url|videoSrc|source_url|stream_url|hls_url|mp4_url|cdn_url)\b["\']?\s*:\s*["\']([^"\']{15,})["\']/',
            '/["\']?(?:file|src)\s*["\']?\s*:\s*["\']([^"\']+\.(?:mp4|webm|m3u8|mpd|ts|ogg)[^"\']*)["\']/',
            '/(?:setVideoUrl|setFile|setSrc)\([\'"]([^\'"]+)[\'"]\)/',
            '/(?:mp4|hls|dash|webm|stream)\s*:\s*["\']([^"\']{15,})["\']/',
        ];
        foreach ($patterns as $pat) {
            if (preg_match_all($pat, $html, $m)) {
                foreach ($m[1] as $raw) {
                    $url = $this->resolveUrl(stripslashes(html_entity_decode($raw)));
                    if ($url && $this->isVideoUrl($url)) $s[] = $this->src($url, 'unknown', $this->guessExt($url), 'js-pattern');
                }
            }
        }
        return $s;
    }

    private function extractDirectUrls(string $html): array
    {
        $s = [];
        if (preg_match_all('/(https?:\/\/[^\s"\'<>]+\.(?:mp4|webm|ogg|m3u8|mpd|ts|m4v)[^\s"\'<>]*)/i', $html, $m)) {
            foreach ($m[1] as $url) {
                $url = html_entity_decode(rtrim($url, '.,;)\\'));
                if ($this->validUrl($url)) $s[] = $this->src($url, 'unknown', $this->guessExt($url), 'direct-url');
            }
        }
        return $s;
    }

    private function extractM3u8(string $html): array
    {
        $s = [];
        if (preg_match_all('/["\']?(https?:\/\/[^"\'<>\s]+\.m3u8[^"\'<>\s]*)["\']?/i', $html, $m)) {
            foreach ($m[1] as $url) {
                $url = html_entity_decode(rtrim($url, '.,;)\\'));
                if ($this->validUrl($url)) $s[] = $this->src($url, 'hls', 'm3u8', 'm3u8-scan');
            }
        }
        return $s;
    }

    private function extractMpd(string $html): array
    {
        $s = [];
        if (preg_match_all('/["\']?(https?:\/\/[^"\'<>\s]+\.mpd[^"\'<>\s]*)["\']?/i', $html, $m)) {
            foreach ($m[1] as $url) {
                $url = html_entity_decode(rtrim($url, '.,;)\\'));
                if ($this->validUrl($url)) $s[] = $this->src($url, 'dash', 'mpd', 'mpd-scan');
            }
        }
        return $s;
    }

    // -----------------------------------------------------------------------
    // Utilities
    // -----------------------------------------------------------------------

    private function src(string $url, string $quality, string $format, string $source): array
    {
        return ['url' => $url, 'quality' => $quality, 'format' => $format, 'source' => $source];
    }

    private function parseSourcesArr(string $json, array &$out, string $source): void
    {
        $arr = @json_decode('['.trim($json,'[] ').']', true)
            ?? @json_decode($json, true);
        foreach ((array)$arr as $item) {
            $url = $item['file'] ?? $item['src'] ?? $item['url'] ?? '';
            if ($this->validUrl($url))
                $out[] = $this->src($url, $item['label'] ?? $item['res'] ?? 'unknown', $this->guessExt($url), $source);
        }
    }

    private function resolveUrl(string $url): string
    {
        $url = trim(stripslashes(html_entity_decode($url)));
        if (empty($url) || $url === '#') return '';
        if (str_starts_with($url, 'http://') || str_starts_with($url, 'https://'))
            return $this->validUrl($url) ? $url : '';
        if (str_starts_with($url, '//'))
            return (parse_url($this->url, PHP_URL_SCHEME) ?? 'https') . ':' . $url;
        if (str_starts_with($url, '/')) {
            $base = (parse_url($this->finalUrl ?: $this->url, PHP_URL_SCHEME) ?? 'https')
                  . '://' . (parse_url($this->finalUrl ?: $this->url, PHP_URL_HOST) ?? '');
            return $base . $url;
        }
        return '';
    }

    private function validUrl(string $url): bool
    {
        $url = trim($url);
        return !empty($url)
            && (bool) filter_var($url, FILTER_VALIDATE_URL)
            && (str_starts_with($url, 'http://') || str_starts_with($url, 'https://'));
    }

    private function guessExt(string $url): string
    {
        $path = strtolower(parse_url($url, PHP_URL_PATH) ?? '');
        foreach ([...self::VIDEO_EXTS, ...self::STREAM_EXTS] as $ext) {
            if (str_ends_with($path, '.' . $ext)
             || str_contains($url, '.' . $ext . '?')
             || str_contains($url, '.' . $ext . '&'))
                return $ext;
        }
        if (str_contains($url, '.m3u8')) return 'm3u8';
        if (str_contains($url, '.mpd'))  return 'mpd';
        return 'mp4';
    }

    private function isVideoUrl(string $url): bool
    {
        if (!$this->validUrl($url)) return false;
        $lower = strtolower($url);
        foreach ([...self::VIDEO_EXTS, ...self::STREAM_EXTS] as $ext) {
            if (str_contains($lower, '.' . $ext)) return true;
        }
        return false;
    }

    private function qualityScore(array $src): int
    {
        $q = strtolower($src['quality'] ?? '');
        foreach ([
            '4k'=>95,'2160'=>95,'1440'=>88,'1080'=>80,'720'=>70,
            '480'=>50,'360'=>40,'240'=>30,'hd'=>75,'sd'=>45,
            'hls'=>60,'dash'=>62,'high'=>72,'med'=>48,'low'=>32,
        ] as $k => $v) {
            if (str_contains($q, $k)) return $v;
        }
        return 20;
    }

    private function dedupe(array $sources): array
    {
        $hasReal = array_filter($sources, fn($s) => !empty($s['url']));
        $seen = [];
        $out  = [];
        foreach ($sources as $s) {
            if (empty($s['url'])) {
                // Only keep note entries if no real sources from the same site
                $site        = $s['source'] ?? '';
                $siteHasReal = array_filter($hasReal, fn($r) => ($r['source'] ?? '') === $site);
                if (!$siteHasReal) $out[] = $s;
                continue;
            }
            $key = $s['url'];
            if (!isset($seen[$key])) {
                $seen[$key] = true;
                $out[] = $s;
            }
        }
        usort($out, fn($a, $b) => $this->qualityScore($b) - $this->qualityScore($a));
        return $out;
    }

    public function getTitle(): string
    {
        if (preg_match('/<title[^>]*>([^<]+)<\/title>/i', $this->html, $m))
            return html_entity_decode(trim($m[1]), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        return '';
    }

    public function getThumbnail(): string
    {
        foreach ([
            '/<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\'][^>]*>/i',
            '/<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image["\'][^>]*>/i',
        ] as $pat) {
            if (preg_match($pat, $this->html, $m)) return html_entity_decode($m[1]);
        }
        return '';
    }

    public function getDomain(): string
    {
        return strtolower(parse_url($this->finalUrl ?: $this->url, PHP_URL_HOST) ?? '');
    }
}
