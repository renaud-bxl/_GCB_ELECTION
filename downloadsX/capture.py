#!/usr/bin/env python3
"""
downloadsX — Capteur de flux vidéo hardcore
Utilise Playwright (vrai navigateur) + interception réseau pour capturer
le flux vidéo RÉEL après les pubs, sur n'importe quel site.

Usage :
    python3 capture.py <url> [--wait 30] [--out results.json]
    python3 capture.py <url> --download        # télécharge directement
    python3 capture.py <url> --best            # meilleure qualité seulement

Installation :
    pip install playwright
    playwright install chromium    # ou utilise le Chromium système
"""

import sys, os, re, json, time, glob, argparse, subprocess, urllib.parse
from pathlib import Path
from collections import defaultdict
from typing import Optional

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# CDN vidéo connus — ces URLs sont TOUJOURS la vraie vidéo
CDN_WHITELIST = {
    'xhcdn.com', 'xhamster.com',
    'xvideos-cdn.com', 'xvideos.com', 'xvideoscdn.com',
    'phncdn.com', 'pornhub.com',
    'redtubefiles.com', 'redtube.com',
    'xnxx-cdn.com', 'xnxx.com',
    'spankbangmedia.com', 'spankbang.com',
    'eporner.com',
    'tube8.com', 'youporn.com',
    'vimeocdn.com', 'vimeo.com',
    'dailymotioncdn.com', 'dailymotion.com',
    'akamaized.net', 'akamai.net', 'akamaistream.net',
    'cloudfront.net', 'fastly.net', 'fastlylb.net',
    'cdninstagram.com', 'fbcdn.net',
    'twimg.com', 'twitter.com', 'x.com',
    'tiktokcdn.com', 'tiktok.com', 'tiktokv.com',
    'rumble.com', 'rumblecdn.com',
    'odysee.com', 'lbryplayer.xyz',
    'streamable.com', 'streamablecdn.com',
    'ok.ru', 'vk.com', 'vkvideo.ru',
    'bilibili.com', 'bilivideo.com', 'bilivideo.cn',
}

# Domaines publicitaires — toujours ignorés
AD_DOMAINS = {
    'tsyndicate.com', 'doubleclick.net', 'googlesyndication.com',
    'googleadservices.com', 'adnxs.com', 'rubiconproject.com',
    'pubmatic.com', 'openx.net', 'casalemedia.com',
    'trafficjunky.net', 'adtng.com', 'juicyads.com',
    'exoclick.com', 'plugrush.com', 'propellerads.com',
    'popcash.net', 'ero-advertising.com', 'adspyglass.com',
    'taboola.com', 'outbrain.com', 'smartadserver.com',
    'adsystem.com', 'springserve.com', 'spotx.tv', 'spotxchange.com',
    'appnexus.com', 'criteo.com', 'revsci.net', 'zedo.com',
}

# Patterns d'URL signalant une pub
AD_URL_PATTERNS = [
    re.compile(p, re.I) for p in [
        r'/ads?/', r'[?&]ad_', r'[?&]vast=', r'/vast/', r'/vmap/',
        r'preroll', r'midroll', r'postroll', r'adbreak',
        r'/commercial/', r'sponsor', r'[?&]adid=', r'[?&]adunit=',
        r'/ad\d+/', r'\.adtech\.', r'clicktag', r'impression',
    ]
]

VIDEO_EXTS = {'.mp4', '.webm', '.m3u8', '.mpd', '.ts', '.m4v', '.ogg', '.mov'}
VIDEO_MIME  = {
    'video/mp4', 'video/webm', 'video/ogg', 'video/x-flv',
    'video/mp2t', 'video/quicktime', 'video/x-msvideo',
    'application/x-mpegurl', 'application/vnd.apple.mpegurl',
    'application/dash+xml', 'application/octet-stream',
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def get_host(url: str) -> str:
    try:
        return urllib.parse.urlparse(url).hostname or ''
    except Exception:
        return ''

def is_ad(url: str) -> bool:
    host = get_host(url).lower()
    full = url.lower()
    if any(d in host for d in AD_DOMAINS):
        return True
    if any(p.search(url) for p in AD_URL_PATTERNS):
        return True
    return False

def is_cdn(url: str) -> bool:
    host = get_host(url).lower()
    return any(d in host for d in CDN_WHITELIST)

def is_video_url(url: str, content_type: str = '') -> bool:
    if is_ad(url):
        return False
    lower = url.lower()
    path  = urllib.parse.urlparse(url).path.lower()
    if any(path.endswith(ext) or ext in lower for ext in VIDEO_EXTS):
        return True
    ct = content_type.lower().split(';')[0].strip()
    return ct in VIDEO_MIME

def guess_format(url: str, content_type: str = '') -> str:
    lower = url.lower()
    ct    = content_type.lower()
    if '.m3u8' in lower or 'mpegurl' in ct: return 'm3u8'
    if '.mpd'  in lower or 'dash'    in ct: return 'mpd'
    if '.webm' in lower: return 'webm'
    if '.ts'   in lower: return 'ts'
    if '.ogg'  in lower: return 'ogg'
    return 'mp4'

def guess_quality(url: str) -> str:
    m = re.search(r'[/_-](\d{3,4})p', url) or re.search(r'(\d{3,4})p', url)
    if m:
        return m.group(1) + 'p'
    if re.search(r'm3u8|hls', url, re.I): return 'hls'
    if re.search(r'\.mpd|dash',  url, re.I): return 'dash'
    return 'unknown'

def quality_score(q: str) -> int:
    q = q.lower()
    for k, v in [('2160',95),('4k',95),('1440',88),('1080',80),
                 ('720',70),('480',50),('360',40),('240',30),
                 ('hls',60),('dash',62),('hd',75)]:
        if k in q: return v
    return 20

def find_chromium() -> Optional[str]:
    """Trouve le binaire Chromium (Playwright ou système)."""
    pw_base = os.environ.get('PLAYWRIGHT_BROWSERS_PATH', '/opt/pw-browsers')
    candidates = []
    if os.path.isdir(pw_base):
        for entry in sorted(os.listdir(pw_base), reverse=True):
            base = os.path.join(pw_base, entry, 'chrome-linux')
            for b in ['headless_shell', 'chrome', 'chromium']:
                p = os.path.join(base, b)
                if os.path.isfile(p):
                    candidates.append(p)
    for p in ['/usr/bin/chromium', '/usr/bin/chromium-browser',
              '/usr/bin/google-chrome', '/usr/local/bin/chromium']:
        if os.path.isfile(p):
            candidates.append(p)
    return candidates[0] if candidates else None

# ---------------------------------------------------------------------------
# Capteur principal
# ---------------------------------------------------------------------------

class VideoCaptor:
    def __init__(self, url: str, wait_sec: int = 25, verbose: bool = False):
        self.url      = url
        self.wait_sec = wait_sec
        self.verbose  = verbose
        self.found    : dict[str, dict] = {}   # url -> info
        self.ad_urls  : set[str]        = set()

    def log(self, *args):
        if self.verbose:
            print('[capture]', *args, file=sys.stderr)

    def _on_response(self, response):
        """Intercepte chaque réponse HTTP du navigateur."""
        try:
            url = response.url
            ct  = response.headers.get('content-type', '')
            cl  = int(response.headers.get('content-length', '0') or '0')

            if is_ad(url):
                self.ad_urls.add(url)
                return

            if not is_video_url(url, ct):
                return

            # Ignorer les ressources minuscules (tracking pixels, manifests vides)
            if 0 < cl < 2000:
                return

            fmt = guess_format(url, ct)

            # Pour les segments .ts d'un flux HLS : on note le manifest, pas chaque segment
            if fmt == 'ts' and url not in self.found:
                self.log(f'Segment TS ignoré (flux HLS déjà capturé): {url[:80]}')
                return

            if url not in self.found:
                info = {
                    'url'     : url,
                    'quality' : guess_quality(url),
                    'format'  : fmt,
                    'source'  : 'cdn-response' if is_cdn(url) else 'network-response',
                    'is_cdn'  : is_cdn(url),
                    'size_mb' : round(cl / 1048576, 1) if cl > 0 else None,
                }
                self.found[url] = info
                self.log(f"{'✓ CDN' if info['is_cdn'] else '? net'} [{fmt}] {url[:90]}")
        except Exception:
            pass

    def _dismiss_popups(self, page):
        """Ferme les popups de cookie / vérification d'âge."""
        selectors = [
            # Cookies
            '#onetrust-accept-btn-handler', '.cookie-accept', '.accept-btn',
            'button[class*="accept"]', 'button[class*="agree"]',
            '[id*="cookie"] button', '[class*="cookie"] button',
            # Âge
            '.age-gate-content button', '[class*="age-verify"] button',
            '[class*="age-gate"] button', '#age-verify button',
            'button[class*="enter"]', 'a[class*="enter-site"]',
            # Textes
            'button >> text=Accept', 'button >> text=I agree',
            'button >> text=Enter', 'button >> text=Yes',
            'button >> text=Agree', 'button >> text=Continue',
            'button >> text=Je confirme', 'button >> text=Accepter',
            'button >> text=Oui', 'button >> text=OK',
        ]
        for sel in selectors:
            try:
                el = page.query_selector(sel)
                if el and el.is_visible():
                    el.click()
                    page.wait_for_timeout(600)
                    self.log(f'Popup dismissed: {sel}')
            except Exception:
                pass

    def _trigger_play(self, page) -> bool:
        """Déclenche la lecture de la vidéo principale."""
        play_selectors = [
            # xHamster
            '.xh-flag-container', '.player-container', '.video-player',
            '.js-player', '[class*="player-overlay"]', '[class*="play-overlay"]',
            # JWPlayer
            '.jw-display', '.jw-icon-display', '.jw-state-idle',
            # VideoJS
            '.vjs-big-play-button', '.vjs-play-control',
            # Flowplayer / Plyr
            '.fp-play', '.plyr__control--overlaid',
            # Génériques
            'button[aria-label*="play" i]', 'button[aria-label*="Play" i]',
            '[class*="play-button"]', '[class*="playBtn"]', '[class*="PlayBtn"]',
            '[class*="play-btn"]',   '[class*="PlayButton"]',
            # Dernier recours : l'élément vidéo
            'video',
        ]
        for sel in play_selectors:
            try:
                el = page.query_selector(sel)
                if el and el.is_visible():
                    el.scroll_into_view_if_needed()
                    page.wait_for_timeout(200)
                    el.click(force=True)
                    self.log(f'Play déclenché via: {sel}')
                    return True
            except Exception:
                pass
        # Fallback : clic au centre
        try:
            page.mouse.click(640, 400)
            self.log('Play déclenché via clic centre')
            return True
        except Exception:
            return False

    def _get_video_element_src(self, page) -> list[str]:
        """Lit currentSrc de tous les éléments <video> dans le DOM."""
        try:
            return page.evaluate("""() => {
                return Array.from(document.querySelectorAll('video'))
                    .flatMap(v => [v.currentSrc, v.src].filter(Boolean))
                    .filter(u => u.startsWith('http'));
            }""")
        except Exception:
            return []

    def _scan_js_globals(self, page) -> list[str]:
        """Scanne les variables globales JS pour trouver des URLs vidéo."""
        try:
            return page.evaluate("""() => {
                const exts = ['.mp4','.m3u8','.mpd','.webm','.ts'];
                const seen = new Set();
                function scan(obj, depth) {
                    if (depth > 12 || !obj) return;
                    if (typeof obj === 'string') {
                        if (obj.startsWith('https://') && exts.some(e => obj.toLowerCase().includes(e)))
                            seen.add(obj);
                        return;
                    }
                    if (typeof obj === 'object') {
                        try { Object.values(obj).forEach(v => scan(v, depth+1)); } catch(e) {}
                    }
                }
                ['initials','xhvid','playerConfig','jwConfig','videoConfig',
                 'flashvars','mediaDefinitions','sources','playerData',
                 'xhPlayerSettings','__NEXT_DATA__','__NUXT__'].forEach(g => {
                    try { if (window[g]) scan(window[g], 0); } catch(e) {}
                });
                return [...seen];
            }""")
        except Exception:
            return []

    def capture(self) -> list[dict]:
        from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

        chromium_bin = find_chromium()
        self.log(f'Chromium: {chromium_bin}')

        with sync_playwright() as pw:
            launch_opts = dict(
                headless=True,
                args=[
                    '--no-sandbox', '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage', '--disable-gpu',
                    '--autoplay-policy=no-user-gesture-required',
                    '--ignore-certificate-errors',
                    '--disable-blink-features=AutomationControlled',
                    '--mute-audio',
                    # Désactiver le chargement des images pour aller plus vite
                    # (les vidéos passent quand même)
                ],
            )
            if chromium_bin:
                launch_opts['executable_path'] = chromium_bin

            browser = pw.chromium.launch(**launch_opts)
            context = browser.new_context(
                user_agent=(
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
                    'AppleWebKit/537.36 (KHTML, like Gecko) '
                    'Chrome/124.0.0.0 Safari/537.36'
                ),
                locale='fr-FR',
                viewport={'width': 1280, 'height': 720},
                ignore_https_errors=True,
                extra_http_headers={'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8', 'DNT': '1'},
            )

            # Intercepter les réponses réseau
            context.on('response', self._on_response)

            page = context.new_page()

            # ------------------------------------------------------------------
            # Phase 1 : chargement de la page
            # ------------------------------------------------------------------
            try:
                page.goto(self.url, wait_until='domcontentloaded', timeout=self.wait_sec * 1000)
            except PWTimeout:
                self.log('Timeout domcontentloaded — on continue quand même')
            except Exception as e:
                self.log(f'Erreur goto: {e}')

            page.wait_for_timeout(2500)

            # ------------------------------------------------------------------
            # Phase 2 : fermer les popups
            # ------------------------------------------------------------------
            self._dismiss_popups(page)
            page.wait_for_timeout(500)

            # ------------------------------------------------------------------
            # Phase 3 : déclencher la lecture
            # ------------------------------------------------------------------
            self._trigger_play(page)

            # ------------------------------------------------------------------
            # Phase 4 : attendre que la pub se termine et la vraie vidéo démarre
            # On surveille l'apparition d'URLs CDN dans le réseau
            # Timeout progressif : on attend jusqu'à avoir une URL CDN ou épuiser le temps
            # ------------------------------------------------------------------
            deadline = time.time() + min(self.wait_sec, 30)
            cdn_found_at = None

            while time.time() < deadline:
                page.wait_for_timeout(1000)
                cdn_sources = [u for u, v in self.found.items() if v.get('is_cdn')]
                if cdn_sources and cdn_found_at is None:
                    cdn_found_at = time.time()
                    self.log(f'CDN URL détectée, attente 5s pour capturer tous les formats...')
                # Une fois une URL CDN trouvée, on attend encore 5s max
                if cdn_found_at and (time.time() - cdn_found_at) >= 5:
                    break

            # ------------------------------------------------------------------
            # Phase 5 : récupérer currentSrc du DOM et scanner les globals JS
            # ------------------------------------------------------------------
            dom_srcs = self._get_video_element_src(page)
            for url in dom_srcs:
                if not is_ad(url) and url not in self.found:
                    self.found[url] = {
                        'url'    : url,
                        'quality': guess_quality(url),
                        'format' : guess_format(url),
                        'source' : 'video-element',
                        'is_cdn' : is_cdn(url),
                    }
                    self.log(f'DOM video src: {url[:80]}')

            js_urls = self._scan_js_globals(page)
            for url in js_urls:
                if not is_ad(url) and url not in self.found:
                    self.found[url] = {
                        'url'    : url,
                        'quality': guess_quality(url),
                        'format' : guess_format(url),
                        'source' : 'js-global',
                        'is_cdn' : is_cdn(url),
                    }
                    self.log(f'JS global: {url[:80]}')

            browser.close()

        # ------------------------------------------------------------------
        # Filtrage final et tri
        # ------------------------------------------------------------------
        results = list(self.found.values())

        # Si on a des URLs CDN → garder seulement celles-là
        cdn_results = [r for r in results if r.get('is_cdn')]
        if cdn_results:
            results = cdn_results

        # Dédoublonner par qualité/format (garder la meilleure URL de chaque combo)
        by_quality: dict[str, dict] = {}
        for r in results:
            key = f"{r['format']}_{r['quality']}"
            if key not in by_quality or (r.get('is_cdn') and not by_quality[key].get('is_cdn')):
                by_quality[key] = r

        results = sorted(by_quality.values(), key=lambda r: quality_score(r['quality']), reverse=True)

        # Nettoyer le champ interne
        for r in results:
            r.pop('is_cdn', None)

        return results

# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description='Capteur de flux vidéo hardcore')
    parser.add_argument('url',              help='URL de la page vidéo')
    parser.add_argument('--wait',  type=int, default=30, help='Secondes d\'attente (défaut 30)')
    parser.add_argument('--out',            help='Fichier JSON de sortie')
    parser.add_argument('--download',  action='store_true', help='Télécharger la meilleure qualité')
    parser.add_argument('--best',      action='store_true', help='Afficher seulement la meilleure URL')
    parser.add_argument('-v', '--verbose',  action='store_true', help='Mode verbeux')
    args = parser.parse_args()

    captor  = VideoCaptor(args.url, wait_sec=args.wait, verbose=args.verbose)
    sources = captor.capture()

    if not sources:
        print(json.dumps({'error': 'Aucune source vidéo trouvée', 'url': args.url}))
        sys.exit(1)

    if args.best:
        print(sources[0]['url'])
        return

    if args.out:
        with open(args.out, 'w') as f:
            json.dump(sources, f, indent=2, ensure_ascii=False)
        print(f'Résultats sauvegardés dans {args.out}')
    else:
        print(json.dumps(sources, indent=2, ensure_ascii=False))

    if args.download:
        best = sources[0]
        url  = best['url']
        fmt  = best['format']
        q    = best['quality']

        # Utiliser yt-dlp si disponible (gère HLS mieux que wget)
        ytdlp = next((p for p in ['/usr/local/bin/yt-dlp', '/usr/bin/yt-dlp']
                      if os.path.isfile(p)), None)

        filename = re.sub(r'[^a-zA-Z0-9._-]', '_',
                          urllib.parse.urlparse(captor.url).path.split('/')[-1] or 'video')
        filename += f'_{q}.{fmt if fmt != "m3u8" else "mp4"}'

        if ytdlp and fmt in ('m3u8', 'mpd'):
            print(f'\nTéléchargement HLS/DASH via yt-dlp → {filename}', file=sys.stderr)
            subprocess.run([ytdlp, '--no-check-certificate', '-o', filename, url])
        else:
            print(f'\nTéléchargement direct → {filename}', file=sys.stderr)
            subprocess.run(['wget', '--no-check-certificate', '-O', filename,
                           '--user-agent', 'Mozilla/5.0', url])

if __name__ == '__main__':
    main()
