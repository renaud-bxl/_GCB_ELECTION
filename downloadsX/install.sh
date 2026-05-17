#!/bin/bash
# downloadsX — Installation de yt-dlp (méthode 1 : binaire direct)
# Lancez ce script sur votre serveur Linux en tant que root ou avec sudo

set -e

echo "=== Installation de yt-dlp ==="

# Télécharger le binaire officiel
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
     -o /usr/local/bin/yt-dlp

chmod a+rx /usr/local/bin/yt-dlp

echo "yt-dlp installé : $(yt-dlp --version)"
echo ""
echo "=== Test rapide ==="
yt-dlp --dump-json --no-download --no-warnings \
  "https://fra.xhamster.com/videos/bdsm-fetish-love-full-movie-xhKIHJ3" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('Titre:', d['title']); print('Formats:', len(d['formats']))"

echo ""
echo "=== Installation terminée ==="
echo "Vérifiez que le service fonctionne : http://votre-serveur/downloadsX/api.php?action=check"
