#!/usr/bin/env node
/**
 * downloadsX — Playwright headless extractor v2
 * Stratégie : déclenche la lecture, récupère currentSrc du <video>,
 * intercepte les flux HLS/MP4 du CDN en ignorant les pré-rolls publicitaires.
 */

const { chromium } = require('playwright');
const fs = require('fs');

const targetUrl = process.argv[2];
const timeout   = parseInt(process.argv[3] || '30000', 10);

if (!targetUrl) {
  process.stderr.write(JSON.stringify({ error: 'No URL provided' }) + '\n');
  process.exit(1);
}

// ---- Domaines CDN vidéo connus (liste blanche) ----------------------------
const CDN_WHITELIST = [
  'xhcdn.com', 'xhamster.com',
  'xvideos-cdn.com', 'xvideos.com',
  'phncdn.com', 'pornhub.com',
  'redtubefiles.com', 'redtube.com',
  'xnxx-cdn.com', 'xnxx.com',
  'spankbangmedia.com', 'spankbang.com',
  'eporner.com',
  'cdnthumb.com', 'tube8.com',
  'youporncdn.com', 'youporn.com',
  'vimeocdn.com', 'vimeo.com',
  'dailymotioncdn.com', 'dailymotion.com',
  'akamaized.net', 'akamai.net',
  'cloudfront.net', 'fastly.net',
  'cdninstagram.com', 'fbcdn.net',
  'redd.it', 'reddit.com',
  'twimg.com', 'twitter.com',
  'tiktokcdn.com', 'tiktok.com',
  'rumble.com', 'rumblecdn.com',
];

// ---- Domaines publicitaires (liste noire) ---------------------------------
const AD_DOMAINS = [
  'tsyndicate.com', 'doubleclick.net', 'googlesyndication.com',
  'googleadservices.com', 'adnxs.com', 'rubiconproject.com',
  'pubmatic.com', 'openx.net', 'casalemedia.com',
  'trafficjunky.net', 'adtng.com', 'juicyads.com',
  'exoclick.com', 'plugrush.com', 'propellerads.com',
  'popcash.net', 'ero-advertising.com', 'adspyglass.com',
  'taboola.com', 'outbrain.com', 'smartadserver.com',
  'adsystem.com', 'ads.', '/ads/', '/ad/', 'adserver',
  'impression', 'pixel.', 'beacon.', 'track.',
];

// ---- Patterns d'URL qui signalent une pub (peu importe le domaine) --------
const AD_URL_PATTERNS = [
  /\/ads?\//i, /[?&]ad_/i, /[?&]vast=/i, /\/vast\//i,
  /preroll/i, /midroll/i, /postroll/i, /adbreak/i,
  /\/commercial\//i, /sponsor/i,
];

const VIDEO_EXTS = ['.mp4', '.webm', '.m3u8', '.mpd', '.ts', '.m4v', '.ogg'];

function isAdUrl(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    const full  = url.toLowerCase();
    if (AD_DOMAINS.some(d => host.includes(d) || full.includes(d))) return true;
    if (AD_URL_PATTERNS.some(p => p.test(url))) return true;
    return false;
  } catch { return false; }
}

function isFromCdn(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return CDN_WHITELIST.some(d => host.includes(d));
  } catch { return false; }
}

function isVideoUrl(url) {
  if (isAdUrl(url)) return false;
  const lower = url.toLowerCase();
  return VIDEO_EXTS.some(e => lower.includes(e));
}

function guessFormat(url, ct = '') {
  const l = url.toLowerCase();
  if (l.includes('.m3u8') || ct.includes('mpegurl'))  return 'm3u8';
  if (l.includes('.mpd')  || ct.includes('dash'))      return 'mpd';
  if (l.includes('.webm')) return 'webm';
  if (l.includes('.ts'))   return 'ts';
  return 'mp4';
}

function guessQuality(url) {
  const m = url.match(/[/_-](\d{3,4})p/i) || url.match(/(\d{3,4})p/i);
  if (m) return m[1] + 'p';
  if (/hls|m3u8/i.test(url)) return 'hls';
  if (/dash|\.mpd/i.test(url)) return 'dash';
  return 'unknown';
}

function findChromiumBin() {
  const pwBase = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  const candidates = [];
  if (fs.existsSync(pwBase)) {
    for (const entry of fs.readdirSync(pwBase)) {
      const base = `${pwBase}/${entry}/chrome-linux`;
      for (const bin of ['headless_shell', 'chrome', 'chromium', 'chrome-wrapper']) {
        const p = `${base}/${bin}`;
        if (fs.existsSync(p)) candidates.push(p);
      }
    }
  }
  for (const p of ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome']) {
    if (fs.existsSync(p)) candidates.push(p);
  }
  return candidates[0] || null;
}

// ===========================================================================

(async () => {
  const found   = new Map();   // url -> {url, quality, format, source, isCdn}
  const adSeen  = new Set();

  const browser = await chromium.launch({
    headless: true,
    executablePath: findChromiumBin() || undefined,
    args: [
      '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
      '--disable-gpu', '--autoplay-policy=no-user-gesture-required',
      '--ignore-certificate-errors', '--disable-blink-features=AutomationControlled',
      '--mute-audio',
    ],
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'fr-FR',
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
    extraHTTPHeaders: { 'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8', 'DNT': '1' },
  });

  // ----- Intercepter les requêtes réseau ------------------------------------
  context.on('response', async (response) => {
    try {
      const url = response.url();
      const ct  = (response.headers()['content-type'] || '').toLowerCase();
      const isVid = isVideoUrl(url)
        || ct.includes('video/')
        || ct.includes('mpegurl')
        || ct.includes('dash+xml');

      if (!isVid || isAdUrl(url)) { if (isAdUrl(url)) adSeen.add(url); return; }

      // Ignore tiny files (< 5 KB = probablement un pixel de tracking)
      const cl = parseInt(response.headers()['content-length'] || '0', 10);
      if (cl > 0 && cl < 5000) return;

      if (!found.has(url)) {
        found.set(url, {
          url,
          quality: guessQuality(url),
          format:  guessFormat(url, ct),
          source:  isFromCdn(url) ? 'cdn-response' : 'network-response',
          isCdn:   isFromCdn(url),
        });
      }
    } catch {}
  });

  const page = await context.newPage();

  try {
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout });

    // --- 1. Attendre le chargement JS initial
    await page.waitForTimeout(2500);

    // --- 2. Rejeter les popups : cookies, âge, etc.
    const dismissSelectors = [
      // Consentement cookies
      '#onetrust-accept-btn-handler', '.cookie-accept', '.accept-btn',
      'button[class*="accept"]', 'button[class*="agree"]',
      // Vérification d'âge
      '.age-gate-content button', '[class*="age-verify"] button',
      '[class*="age-gate"] button', '#age-verify button',
      'button[class*="enter"]', 'a[class*="enter-site"]',
      // Textes génériques
      'button:has-text("Accept")', 'button:has-text("I agree")',
      'button:has-text("Enter")', 'button:has-text("Yes, I am")',
      'button:has-text("Agree")', 'button:has-text("Continue")',
      'button:has-text("Je confirme")', 'button:has-text("Accepter")',
    ];
    for (const sel of dismissSelectors) {
      try {
        const el = await page.$(sel);
        if (el && await el.isVisible()) {
          await el.click();
          await page.waitForTimeout(800);
        }
      } catch {}
    }

    // --- 3. Scroller jusqu'au player et déclencher la lecture
    const playerSelectors = [
      // xHamster
      '.player-container', '.xh-video-player', '.video-player',
      '[class*="player-overlay"]', '[class*="play-overlay"]',
      // Génériques
      '.jw-display', '.jw-icon-display', '.vjs-big-play-button',
      '.fp-play', '.plyr__control--overlaid',
      'button[aria-label*="play" i]', 'button[aria-label*="Play" i]',
      '[class*="play-button"]', '[class*="playBtn"]',
      // Fallback : l'élément vidéo lui-même
      'video',
    ];

    let clicked = false;
    for (const sel of playerSelectors) {
      try {
        const el = await page.$(sel);
        if (el && await el.isVisible()) {
          await el.scrollIntoViewIfNeeded();
          await page.waitForTimeout(300);
          await el.click({ force: true });
          clicked = true;
          break;
        }
      } catch {}
    }

    if (!clicked) {
      // Dernier recours : clic au centre de la page
      await page.mouse.click(640, 400);
    }

    // --- 4. Attendre que la vidéo se charge (max timeout restant)
    const waitMs = Math.min(timeout / 2, 12000);
    await page.waitForTimeout(waitMs);

    // --- 5. Récupérer currentSrc du <video> (source réelle en cours de lecture)
    const videoSrcs = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('video')).map(v => ({
        src:        v.src        || null,
        currentSrc: v.currentSrc || null,
        readyState: v.readyState,
        paused:     v.paused,
      }));
    });

    for (const v of videoSrcs) {
      for (const url of [v.currentSrc, v.src]) {
        if (url && url.startsWith('http') && !isAdUrl(url) && !found.has(url)) {
          found.set(url, {
            url,
            quality: guessQuality(url),
            format:  guessFormat(url),
            source:  'video-element',
            isCdn:   isFromCdn(url),
          });
        }
      }
    }

    // --- 6. Scanner window.initials et autres globals JS
    const jsUrls = await page.evaluate(() => {
      const results = [];
      const exts = ['.mp4', '.m3u8', '.mpd', '.webm'];

      function scan(obj, depth) {
        if (depth > 10 || !obj) return;
        if (typeof obj === 'string') {
          if (obj.startsWith('https://') && exts.some(e => obj.toLowerCase().includes(e)))
            results.push(obj);
          return;
        }
        if (typeof obj === 'object') {
          try { Object.values(obj).forEach(v => scan(v, depth + 1)); } catch {}
        }
      }

      // Chercher dans tous les globals pertinents
      ['initials','xhvid','playerConfig','jwConfig','videoConfig',
       'flashvars','mediaDefinitions','sources','playerData'].forEach(g => {
        try { if (window[g]) scan(window[g], 0); } catch {}
      });
      try { scan(window.initials, 0); } catch {}

      return [...new Set(results)];
    });

    for (const url of jsUrls) {
      if (!isAdUrl(url) && !found.has(url)) {
        found.set(url, {
          url,
          quality: guessQuality(url),
          format:  guessFormat(url),
          source:  'js-window',
          isCdn:   isFromCdn(url),
        });
      }
    }

  } catch (err) {
    process.stderr.write('Error: ' + err.message + '\n');
  }

  await browser.close();

  // ---- Prioriser les URLs CDN et éliminer les doublons de qualité ----------
  let results = [...found.values()].filter(s => s.url && s.url.startsWith('http'));

  // Si on a des CDN, ne garder que les CDN
  const cdnResults = results.filter(s => s.isCdn);
  if (cdnResults.length > 0) results = cdnResults;

  // Score de qualité
  const qScore = q => {
    q = (q || '').toLowerCase();
    if (q.includes('1080')) return 80;
    if (q.includes('720'))  return 70;
    if (q.includes('480'))  return 50;
    if (q.includes('360'))  return 40;
    if (q === 'hls')        return 60;
    if (q === 'dash')       return 62;
    return 20;
  };
  results.sort((a, b) => qScore(b.quality) - qScore(a.quality));

  // Enlever le champ isCdn de la sortie finale
  results = results.map(({ isCdn, ...rest }) => rest);

  process.stdout.write(JSON.stringify(results, null, 2));
})();
