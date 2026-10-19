#!/usr/bin/env bash
# Sichert Profile, Gedächtnisse und Verläufe (data/) in ein Archiv.
#   Täglich per Cron:  0 3 * * *  bash /opt/vertex/src/vertex/deploy/backup.sh
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p /opt/vertex/backups
tar -czf "/opt/vertex/backups/vertex-data-$(date +%F).tar.gz" data config/.env
ls -1t /opt/vertex/backups/vertex-data-*.tar.gz | tail -n +15 | xargs -r rm --
echo "Backup: /opt/vertex/backups/vertex-data-$(date +%F).tar.gz"
