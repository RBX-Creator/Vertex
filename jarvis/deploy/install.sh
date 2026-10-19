#!/usr/bin/env bash
# Jarvis auf einem frischen Ubuntu/Debian-Server installieren.
#   curl -fsSL https://raw.githubusercontent.com/RBX-Creator/Vertex/claude/jarvis-ai-assistant-thtjff/jarvis/deploy/install.sh | sudo bash
set -euo pipefail

REPO="${REPO:-https://github.com/RBX-Creator/Vertex.git}"
BRANCH="${BRANCH:-claude/jarvis-ai-assistant-thtjff}"
DIR="${DIR:-/opt/jarvis}"

[ "$(id -u)" -eq 0 ] || { echo "Bitte als root ausführen (sudo)."; exit 1; }

ask() { # ask VAR "Frage" [Standard]
  local answer
  read -r -p "$2${3:+ [$3]}: " answer < /dev/tty || true
  printf -v "$1" '%s' "${answer:-${3:-}}"
}

setenv() { # setenv KEY WERT – setzt einen Wert in config/.env
  K="$1" V="$2" awk 'BEGIN { done = 0 }
    index($0, ENVIRON["K"] "=") == 1 { print ENVIRON["K"] "=" ENVIRON["V"]; done = 1; next }
    { print }
    END { if (!done) print ENVIRON["K"] "=" ENVIRON["V"] }' config/.env > config/.env.tmp
  mv config/.env.tmp config/.env
}

echo "== Pakete =="
apt-get update -qq
apt-get install -y -qq git curl ca-certificates > /dev/null
if ! command -v docker > /dev/null; then
  echo "== Docker installieren =="
  curl -fsSL https://get.docker.com | sh
fi

echo "== Jarvis holen =="
if [ -d "$DIR/src/.git" ]; then
  git -C "$DIR/src" fetch -q origin "$BRANCH" && git -C "$DIR/src" checkout -q "$BRANCH" && git -C "$DIR/src" pull -q
else
  mkdir -p "$DIR"
  git clone -q -b "$BRANCH" --depth 1 "$REPO" "$DIR/src"
fi
cd "$DIR/src/jarvis"

if [ ! -f config/.env ]; then
  echo "== Einrichtung =="
  cp config/.env.example config/.env
  chmod 600 config/.env
  IP="$(curl -fsS4 https://api.ipify.org || hostname -I | awk '{print $1}')"
  echo "Ohne eigene Domain geht auch ${IP//./-}.sslip.io (zeigt automatisch auf diesen Server)."
  ask DOMAIN "Domain" "${IP//./-}.sslip.io"
  ask GEMINI "Gemini-API-Schlüssel (Gespräch)"
  ask ANTHROPIC "Anthropic-API-Schlüssel (Claude, Arbeitsmodus)"
  ask DEEPGRAM "Deepgram-API-Schlüssel (Hören)"
  ask ELEVEN "ElevenLabs-API-Schlüssel (Sprechen)"
  ask VOICE "ElevenLabs-Stimmen-ID (leer = Standard)"
  CODE="$(tr -dc 'a-z0-9' < /dev/urandom | head -c 8)"
  ask TEAMCODE "Team-Code für neue Profile" "$CODE"
  setenv JARVIS_DOMAIN "$DOMAIN"
  setenv GEMINI_API_KEY "$GEMINI"
  setenv ANTHROPIC_API_KEY "$ANTHROPIC"
  setenv DEEPGRAM_API_KEY "$DEEPGRAM"
  setenv ELEVENLABS_API_KEY "$ELEVEN"
  setenv ELEVENLABS_VOICE_ID "$VOICE"
  setenv JARVIS_TEAM_CODE "$TEAMCODE"
else
  echo "config/.env existiert schon – Einstellungen bleiben erhalten."
fi

echo "== Starten =="
docker compose up -d --build

DOMAIN="$(grep '^JARVIS_DOMAIN=' config/.env | cut -d= -f2-)"
TEAMCODE="$(grep '^JARVIS_TEAM_CODE=' config/.env | cut -d= -f2-)"
cat <<INFO

  Jarvis läuft:   https://$DOMAIN
  Team-Code:      $TEAMCODE

  Handy: Link öffnen → Teilen/Menü → „Zum Home-Bildschirm“.
  Einstellungen ändern:  nano $DIR/src/jarvis/config/.env  &&  bash $DIR/src/jarvis/deploy/update.sh
  Logs ansehen:          cd $DIR/src/jarvis && docker compose logs -f jarvis
INFO
