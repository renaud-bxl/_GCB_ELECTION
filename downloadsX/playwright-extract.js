#!/usr/bin/env node
/**
 * downloadsX — Playwright network-intercept extractor
 * Usage: node playwright-extract.js <url> [timeout_ms]
 * Output: JSON array of {url, quality, format, source} to stdout
 */

const { chromium } = require('playwright');
const fs = require('fs');

// Locate Chromium/headless_shell binary (handles different Playwright versions)
function findChromiumBin() {
  const candidates = [
    // System path
    '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome',
  ];
  // Scan PW browsers dir
  const pwBase = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (fs.existsSync(pwBase)) {
    for (const entry of fs.readdirSync(pwBase)) {
      const base = `${pwBase}/${entry}/chrome-linux`;
      for (const bin of ['headless_shell', 'chrome', 'chromium', 'chrome-wrapper']) {
        const p = `${base}/${bin}`;
        if (fs.existsSync(p)) candidates.unshift(p);
      }
    }
  }
  return candidates.find(p => fs.existsSync(p)) || null;
}
const CHROMIUM_BIN = findChromiumBin();

const targetUrl = process.argv[2];
const timeout   = parseInt(process.argv[3] || '20000', 10);

if (!targetUrl) {
  console.error(JSON.stringify({ error: 'No URL provided' }));
  process.exit(1);
}

const VIDEO_EXTS   = ['.mp4', '.webm', '.m3u8', '.mpd', '.ts', '.m4v', '.ogg'];
const STREAM_TYPES = ['application/x-mpegurl', 'application/vnd.apple.mpegurl',
                      'video/mp4', 'video/webm', 'video/ogg', 'video/x-flv',
                      'application/dash+xml', 'video/mp2t'];

const AD_DOMAINS = [
  'tsyndicate.com', 'doubleclick.net', 'googlesyndication.com', 'adnxs.com',
  'trafficjunky.net', 'adtng.com', 'juicyads.com', 'exoclick.com',
  'plugrush.com', 'propellerads.com', 'popcash.net', 'ero-advertising.com',
  'taboola.com', 'outbrain.com', 'rubiconproject.com', 'pubmatic.com',
];

function isAdUrl(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return AD_DOMAINS.some(d => host.includes(d));
  } catch { return false; }
}

function isVideoUrl(url, contentType = '') {
  if (isAdUrl(url)) return false;
  const lower = url.toLowerCase();
  if (VIDEO_EXTS.some(ext => lower.includes(ext))) return true;
  if (STREAM_TYPES.some(t => contentType.toLowerCase().includes(t))) return true;
  return false;
}

function guessFormat(url, contentType = '') {
  const lower = url.toLowerCase();
  if (lower.includes('.m3u8') || contentType.includes('mpegurl')) return 'm3u8';
  if (lower.includes('.mpd')  || contentType.includes('dash'))    return 'mpd';
  if (lower.includes('.mp4'))  return 'mp4';
  if (lower.includes('.webm')) return 'webm';
  if (lower.includes('.ts'))   return 'ts';
  if (lower.includes('.ogg'))  return 'ogg';
  return 'mp4';
}

function guessQuality(url) {
  const m = url.match(/(\d{3,4})p/i);
  if (m) return m[1] + 'p';
  if (url.includes('1080')) return '1080p';
  if (url.includes('720'))  return '720p';
  if (url.includes('480'))  return '480p';
  if (url.includes('360'))  return '360p';
  if (url.includes('hls') || url.includes('m3u8')) return 'hls';
  if (url.includes('dash') || url.includes('mpd'))  return 'dash';
  return 'unknown';
}

(async () => {
  const found    = new Map(); // url -> source object
  const pageUrls = new Set();

  const launchOpts = {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-web-security',
      '--autoplay-policy=no-user-gesture-required',
      '--ignore-certificate-errors',
      '--disable-blink-features=AutomationControlled',
    ],
  };
  if (CHROMIUM_BIN) launchOpts.executablePath = CHROMIUM_BIN;

  const browser = await chromium.launch(launchOpts);

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'fr-FR',
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
    extraHTTPHeaders: {
      'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
      'DNT': '1',
    },
  });

  // Intercept ALL network requests
  await context.route('**/*', async (route) => {
    const req         = route.request();
    const url         = req.url();
    const resType     = req.resourceType();

    // Collect video requests immediately
    if (resType === 'media' && !isAdUrl(url)) {
      found.set(url, {
        url,
        quality: guessQuality(url),
        format:  guessFormat(url),
        source:  'network-media',
      });
    }

    // Check URL pattern for video streams
    if (isVideoUrl(url) && !found.has(url)) {
      found.set(url, {
        url,
        quality: guessQuality(url),
        format:  guessFormat(url),
        source:  'network-intercept',
      });
    }

    pageUrls.add(url);
    await route.continue();
  });

  // Also listen to responses for content-type sniffing
  context.on('response', async (response) => {
    try {
      const url         = response.url();
      const contentType = response.headers()['content-type'] || '';
      if (isVideoUrl(url, contentType) && !found.has(url) && !isAdUrl(url)) {
        found.set(url, {
          url,
          quality: guessQuality(url),
          format:  guessFormat(url, contentType),
          source:  'network-response',
        });
      }
    } catch {}
  });

  const page = await context.newPage();

  // Listen for console messages that might reveal video URLs
  page.on('console', msg => {
    const text = msg.text();
    const urlMatches = text.match(/https?:\/\/[^\s"'<>]+\.(?:mp4|m3u8|mpd|webm)[^\s"'<>]*/gi);
    if (urlMatches) {
      urlMatches.forEach(url => {
        if (!isAdUrl(url) && !found.has(url)) {
          found.set(url, { url, quality: guessQuality(url), format: guessFormat(url), source: 'console' });
        }
      });
    }
  });

  try {
    await page.goto(targetUrl, {
      waitUntil: 'domcontentloaded',
      timeout: timeout,
    });

    // Wait a bit for initial JS to execute
    await page.waitForTimeout(3000);

    // Try to dismiss cookie/age banners first
    const dismissSelectors = [
      '[data-role="accept"]', '.accept-btn', '#accept-all', '.cookie-accept',
      '.age-gate button', '.age-verify button', '[class*="age"] button',
      'button[class*="enter"]', '.enter-btn', '#enter-site',
      'button:has-text("Enter")', 'button:has-text("I agree")',
      'button:has-text("Accept")', 'button:has-text("Yes")',
      '.primary-btn', '.btn-primary',
    ];
    for (const sel of dismissSelectors) {
      try {
        const el = await page.$(sel);
        if (el && await el.isVisible()) {
          await el.click();
          await page.waitForTimeout(1000);
          break;
        }
      } catch {}
    }

    // Try to click play button
    const playSelectors = [
      'button.play-btn', '.play-button', '[class*="play"]', '.jw-icon-display',
      'video', '.player', '#player', '[class*="player"]',
      '[aria-label*="play" i]', '[aria-label*="Play" i]',
      '.vjs-big-play-button', '.fp-play',
    ];
    for (const sel of playSelectors) {
      try {
        const el = await page.$(sel);
        if (el && await el.isVisible()) {
          await el.click({ timeout: 2000 });
          await page.waitForTimeout(3000);
          break;
        }
      } catch {}
    }

    // Wait for video network requests
    await page.waitForTimeout(5000);

    // Extract from page JS variables (window.initials etc.)
    const jsUrls = await page.evaluate(() => {
      const urls = [];
      const exts = ['.mp4', '.m3u8', '.mpd', '.webm'];

      // Stringify window globals and search for video URLs
      const scanObj = (obj, depth = 0) => {
        if (depth > 8 || !obj) return;
        if (typeof obj === 'string') {
          if (obj.startsWith('http') && exts.some(e => obj.includes(e))) urls.push(obj);
          return;
        }
        if (typeof obj === 'object') {
          try { Object.values(obj).forEach(v => scanObj(v, depth + 1)); } catch {}
        }
      };

      // Scan known globals
      const globals = ['initials', 'xhvid', 'playerConfig', 'jwConfig',
                       'flashvars', 'mediaDefinitions', 'videoConfig', 'sources'];
      globals.forEach(g => {
        try { if (window[g]) scanObj(window[g]); } catch {}
      });

      // Scan window.initials specifically
      try {
        if (window.initials) scanObj(window.initials);
      } catch {}

      return [...new Set(urls)];
    });

    jsUrls.forEach(url => {
      if (!isAdUrl(url) && !found.has(url)) {
        found.set(url, { url, quality: guessQuality(url), format: guessFormat(url), source: 'js-window' });
      }
    });

    // Also grab <video> and <source> tags from final DOM
    const domUrls = await page.evaluate(() => {
      const urls = [];
      document.querySelectorAll('video[src], source[src]').forEach(el => {
        const src = el.src || el.getAttribute('src');
        if (src && src.startsWith('http')) urls.push(src);
      });
      return urls;
    });

    domUrls.forEach(url => {
      if (!isAdUrl(url) && !found.has(url)) {
        found.set(url, { url, quality: guessQuality(url), format: guessFormat(url), source: 'dom' });
      }
    });

  } catch (err) {
    process.stderr.write('Navigation error: ' + err.message + '\n');
  }

  await browser.close();

  const results = [...found.values()].filter(s => s.url && s.url.startsWith('http'));

  // Sort by quality
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

  process.stdout.write(JSON.stringify(results, null, 2));
})();
