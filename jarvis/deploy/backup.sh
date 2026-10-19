#!/usr/bin/env bash
# Sichert Profile, Gedächtnisse und Verläufe (data/) in ein Archiv.
#   Täglich per Cron:  0 3 * * *  bash /opt/jarvis/src/jarvis/deploy/backup.sh
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p /opt/jarvis/backups
tar -czf "/opt/jarvis/backups/jarvis-data-$(date +%F).tar.gz" data config/.env
ls -1t /opt/jarvis/backups/jarvis-data-*.tar.gz | tail -n +15 | xargs -r rm --
echo "Backup: /opt/jarvis/backups/jarvis-data-$(date +%F).tar.gz"
