#!/usr/bin/env bash
# GPS Tracking Platform — database backup (dagelijks draaien via cron/systemd-timer)
# Gebruik: backup.sh [doelmap]  (standaard /var/backups/gps-tracking)
set -euo pipefail

DEST="${1:-/var/backups/gps-tracking}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-30}"
STAMP="$(date +%Y%m%d-%H%M%S)"
FILE="$DEST/gps_tracking-$STAMP.sql.gz"

mkdir -p "$DEST"

# DATABASE_URL uit de env-file van de web-service
if [ -f /etc/gps-tracking/gps-web.env ]; then
  set -a
  # shellcheck disable=SC1091
  . /etc/gps-tracking/gps-web.env
  set +a
fi
: "${DATABASE_URL:?DATABASE_URL niet ingesteld}"

echo "[backup] dumpen naar $FILE"
pg_dump "$DATABASE_URL" --format=custom --no-owner | gzip > "$FILE"
chmod 600 "$FILE"

echo "[backup] opruimen van dumps ouder dan $KEEP_DAYS dagen"
find "$DEST" -name 'gps_tracking-*.sql.gz' -mtime "+$KEEP_DAYS" -delete

echo "[backup] klaar: $(du -h "$FILE" | cut -f1)"
