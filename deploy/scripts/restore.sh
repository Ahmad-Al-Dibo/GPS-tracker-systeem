#!/usr/bin/env bash
# GPS Tracking Platform — database restore
# Gebruik: restore.sh <backup-bestand.sql.gz>
# LET OP: overschrijft de huidige database. Diensten eerst stoppen:
#   sudo systemctl stop gps-web gps-tcp gps-jobs
set -euo pipefail

FILE="${1:?Gebruik: restore.sh <gps_tracking-YYYYMMDD-HHMMSS.sql.gz>}"

if [ -f /etc/gps-tracking/gps-web.env ]; then
  set -a
  # shellcheck disable=SC1091
  . /etc/gps-tracking/gps-web.env
  set +a
fi
: "${DATABASE_URL:?DATABASE_URL niet ingesteld}"

echo "[restore] LET OP: dit overschrijft de huidige database uit $FILE"
read -r -p "Typ 'ja' om door te gaan: " CONFIRM
[ "$CONFIRM" = "ja" ] || { echo "Geannuleerd"; exit 1; }

echo "[restore] herstellen..."
gunzip -c "$FILE" | pg_restore --clean --if-exists --no-owner --dbname="$DATABASE_URL"

echo "[restore] klaar. Start de diensten opnieuw:"
echo "  sudo systemctl start gps-web gps-tcp gps-jobs"
