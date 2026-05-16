<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>downloadsX — Téléchargeur vidéo</title>
<style>
  :root {
    --bg: #0f0f13;
    --surface: #1a1a24;
    --border: #2a2a3a;
    --accent: #7c3aed;
    --accent2: #a855f7;
    --text: #e2e8f0;
    --muted: #6b7280;
    --success: #22c55e;
    --warn: #f59e0b;
    --error: #ef4444;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: var(--bg);
    color: var(--text);
    font-family: 'Segoe UI', system-ui, sans-serif;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 2rem 1rem;
  }
  .logo {
    font-size: 2.5rem;
    font-weight: 800;
    background: linear-gradient(135deg, var(--accent), var(--accent2));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    margin-bottom: .25rem;
  }
  .tagline { color: var(--muted); font-size: .9rem; margin-bottom: 2.5rem; }
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 2rem;
    width: 100%;
    max-width: 720px;
    margin-bottom: 1.5rem;
  }
  .input-row { display: flex; gap: .75rem; }
  input[type=text] {
    flex: 1;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 10px;
    color: var(--text);
    padding: .75rem 1rem;
    font-size: 1rem;
    outline: none;
    transition: border-color .2s;
  }
  input[type=text]:focus { border-color: var(--accent); }
  button {
    background: linear-gradient(135deg, var(--accent), var(--accent2));
    border: none;
    border-radius: 10px;
    color: #fff;
    cursor: pointer;
    font-size: 1rem;
    font-weight: 600;
    padding: .75rem 1.5rem;
    transition: opacity .2s;
    white-space: nowrap;
  }
  button:hover { opacity: .85; }
  button:disabled { opacity: .5; cursor: not-allowed; }
  .hint { color: var(--muted); font-size: .8rem; margin-top: .75rem; }
  #result { display: none; }
  .video-title {
    font-size: 1.1rem;
    font-weight: 600;
    margin-bottom: 1rem;
    word-break: break-word;
  }
  .thumbnail {
    width: 100%;
    border-radius: 10px;
    margin-bottom: 1.25rem;
    max-height: 300px;
    object-fit: cover;
    background: var(--border);
  }
  .sources-label {
    color: var(--muted);
    font-size: .8rem;
    text-transform: uppercase;
    letter-spacing: .05em;
    margin-bottom: .75rem;
  }
  .source-row {
    display: flex;
    align-items: center;
    gap: .75rem;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: .75rem 1rem;
    margin-bottom: .5rem;
  }
  .badge {
    font-size: .75rem;
    font-weight: 700;
    padding: .2rem .55rem;
    border-radius: 6px;
    text-transform: uppercase;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .badge-mp4 { background: #1d4ed8; color: #fff; }
  .badge-m3u8 { background: #b45309; color: #fff; }
  .badge-webm { background: #15803d; color: #fff; }
  .badge-unknown { background: var(--border); color: var(--muted); }
  .quality-badge {
    font-size: .75rem;
    padding: .2rem .55rem;
    border-radius: 6px;
    background: #2a2a3a;
    color: var(--accent2);
    flex-shrink: 0;
  }
  .source-url {
    flex: 1;
    font-size: .78rem;
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .dl-btn {
    font-size: .8rem;
    padding: .4rem .9rem;
    border-radius: 8px;
    flex-shrink: 0;
  }
  .copy-btn {
    font-size: .8rem;
    padding: .4rem .9rem;
    border-radius: 8px;
    flex-shrink: 0;
    background: var(--border);
    color: var(--text);
  }
  .copy-btn:hover { background: #3a3a4a; }
  .error-box {
    background: rgba(239,68,68,.1);
    border: 1px solid rgba(239,68,68,.3);
    border-radius: 10px;
    color: var(--error);
    padding: 1rem;
  }
  .spinner {
    display: none;
    width: 22px; height: 22px;
    border: 3px solid rgba(255,255,255,.2);
    border-top-color: #fff;
    border-radius: 50%;
    animation: spin .7s linear infinite;
    flex-shrink: 0;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .no-results { color: var(--warn); text-align: center; padding: 1rem 0; }
  .note-box {
    background: rgba(245,158,11,.07);
    border: 1px solid rgba(245,158,11,.2);
    border-radius: 8px;
    color: var(--warn);
    font-size: .82rem;
    padding: .75rem 1rem;
    margin-bottom: .5rem;
  }
  .supported {
    display: flex;
    flex-wrap: wrap;
    gap: .5rem;
    margin-top: .75rem;
  }
  .site-tag {
    background: var(--border);
    border-radius: 6px;
    color: var(--muted);
    font-size: .75rem;
    padding: .2rem .6rem;
  }
</style>
</head>
<body>

<div class="logo">downloadsX</div>
<p class="tagline">Extracteur de sources vidéo — collez une URL, récupérez la vidéo</p>

<div class="card">
  <div class="input-row">
    <input type="text" id="urlInput" placeholder="https://..." autocomplete="off" spellcheck="false">
    <button id="analyzeBtn" onclick="analyze()">
      <span id="btnText">Analyser</span>
      <div class="spinner" id="spinner"></div>
    </button>
  </div>
  <p class="hint">
    Sites supportés :
    <span class="supported">
      <span class="site-tag">xHamster</span>
      <span class="site-tag">xVideos</span>
      <span class="site-tag">PornHub</span>
      <span class="site-tag">RedTube</span>
      <span class="site-tag">HTML5 générique</span>
      <span class="site-tag">OG:video</span>
      <span class="site-tag">JSON-LD</span>
      <span class="site-tag">HLS/m3u8</span>
    </span>
  </p>
</div>

<div class="card" id="result"></div>

<script>
const apiBase = 'api.php';

async function analyze() {
  const url = document.getElementById('urlInput').value.trim();
  if (!url) return;

  const btn     = document.getElementById('analyzeBtn');
  const spinner = document.getElementById('spinner');
  const btnText = document.getElementById('btnText');
  const result  = document.getElementById('result');

  btn.disabled = true;
  btnText.style.display = 'none';
  spinner.style.display = 'block';
  result.style.display  = 'none';
  result.innerHTML = '';

  try {
    const res  = await fetch(`${apiBase}?action=info&url=${encodeURIComponent(url)}`);
    const data = await res.json();

    if (!data.success) {
      result.innerHTML = `<div class="error-box">Erreur : ${escHtml(data.error)}</div>`;
    } else if (!data.sources || data.sources.length === 0) {
      result.innerHTML = `<div class="no-results">Aucune source vidéo détectée dans cette page.<br>
        <small style="color:var(--muted)">Essayez avec une autre URL ou un site supporté.</small></div>`;
    } else {
      let html = '';
      if (data.thumbnail) {
        html += `<img class="thumbnail" src="${escAttr(data.thumbnail)}" alt="thumbnail" loading="lazy">`;
      }
      if (data.title) {
        html += `<div class="video-title">${escHtml(data.title)}</div>`;
      }
      html += `<div class="sources-label">${data.count} source${data.count > 1 ? 's' : ''} trouvée${data.count > 1 ? 's' : ''}</div>`;

      for (const src of data.sources) {
        if (src.note) {
          html += `<div class="note-box">${escHtml(src.note)}</div>`;
          continue;
        }
        const fmtClass = ['mp4','m3u8','webm'].includes(src.format) ? `badge-${src.format}` : 'badge-unknown';
        html += `<div class="source-row">
          <span class="badge ${fmtClass}">${escHtml(src.format)}</span>
          <span class="quality-badge">${escHtml(src.quality)}</span>
          <span class="source-url" title="${escAttr(src.url)}">${escHtml(src.url)}</span>
          <button class="copy-btn" onclick="copyUrl('${escAttr(src.url)}', this)">Copier</button>
          <button class="dl-btn" onclick="download('${escAttr(src.url)}')">⬇ Télécharger</button>
        </div>`;
      }
      result.innerHTML = html;
    }
    result.style.display = 'block';
  } catch (e) {
    result.innerHTML = `<div class="error-box">Erreur réseau : ${escHtml(e.message)}</div>`;
    result.style.display = 'block';
  } finally {
    btn.disabled = false;
    btnText.style.display = 'inline';
    spinner.style.display = 'none';
  }
}

function download(videoUrl) {
  window.open(`${apiBase}?action=download&url=${encodeURIComponent(videoUrl)}`, '_blank');
}

async function copyUrl(url, btn) {
  try {
    await navigator.clipboard.writeText(url);
    const orig = btn.textContent;
    btn.textContent = '✓ Copié';
    setTimeout(() => btn.textContent = orig, 1500);
  } catch(e) {
    prompt('Copiez cette URL :', url);
  }
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escAttr(s) {
  return String(s).replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// Allow Enter key
document.getElementById('urlInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') analyze();
});
</script>

</body>
</html>
