#!/usr/bin/env bash
# Jarvis auf die neueste Version bringen und neu starten. Daten und Einstellungen bleiben erhalten.
set -euo pipefail
cd "$(dirname "$0")/.."
git pull -q
docker compose up -d --build
docker compose ps
