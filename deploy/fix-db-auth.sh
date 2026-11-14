#!/bin/bash
# deploy/fix-db-auth.sh — maakt database + rol-wachtwoord conform DATABASE_URL
# Leest het wachtwoord uit .env en toont het NERGENS. Geen destructieve acties:
# - ALTER ROLE (wachtwoord vastleggen zodat DATABASE_URL werkt)
# - CREATE DATABASE (bestaat niet — lege DB, geen data om te verliezen)
set -euo pipefail

cd /opt/gps-tracking-system

echo "=== 1. Wachtwoord uit DATABASE_URL (niet tonen) ==="
PW=$(grep '^DATABASE_URL' .env | sed -E 's#^.*://[^:]+:([^@]+)@.*$#\1#')
if [ -z "$PW" ] || [ "$PW" = "postgresql://postgres:" ]; then
  echo "FOUT: kon wachtwoord niet extraheren uit DATABASE_URL"
  exit 1
fi
# SQL-escaping voor eventuele enkele aanhalingstekens
PW_ESC=${PW//\'/\'\'}
echo "wachtwoord-gebruiker: postgres (lengte ${#PW} tekens, waarde niet getoond)"

echo "=== 2. Rol postgres wachtwoord instellen ==="
sudo -u postgres psql -v ON_ERROR_STOP=1 <<EOF
ALTER ROLE postgres PASSWORD '${PW_ESC}';
EOF
echo "ALTER-ROL-OK"

echo "=== 3. Database gps_tracking aanmaken ==="
if sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='gps_tracking'" | grep -q 1; then
  echo "bestaat-al"
else
  sudo -u postgres psql -c "CREATE DATABASE gps_tracking"
  echo "aangemaakt"
fi

echo "=== 4. Authenticatietest via TCP (scram, zoals DATABASE_URL) ==="
PGPASSWORD="$PW" psql -h 127.0.0.1 -U postgres -d gps_tracking -tAc "SELECT current_user || ' / ' || current_database()"
echo "=== EINDE ==="
