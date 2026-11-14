#!/bin/bash
# deploy/install-services.sh — installeert systemd-units + env-bestanden
# Bestaande .env wordt NIET gewijzigd (alleen gekopieerd naar /etc/gps-tracking).
# Toont geen secrets.
set -euo pipefail

cd /opt/gps-tracking-system

echo "=== 1. Env-bestanden aanmaken (kopie .env → /etc/gps-tracking) ==="
if [ ! -f /etc/gps-tracking/gps-web.env ]; then
  cp .env /etc/gps-tracking/gps-web.env
  echo "gps-web.env aangemaakt (kopie van .env)"
else
  echo "gps-web.env bestaat al — ongemoeid gelaten"
fi

if [ ! -f /etc/gps-tracking/gps-tcp.env ]; then
  {
    echo "WEB_INGEST_URL=http://127.0.0.1:3000/api/ingest/teltonika"
    grep '^TELTONIKA_INGEST_KEY=' .env
  } > /etc/gps-tracking/gps-tcp.env
  echo "gps-tcp.env aangemaakt (WEB_INGEST_URL + key uit .env)"
else
  echo "gps-tcp.env bestaat al — ongemoeid gelaten"
fi
chown root:gps /etc/gps-tracking/*.env
chmod 600 /etc/gps-tracking/*.env
ls -la /etc/gps-tracking/

echo "=== 2. systemd-units installeren ==="
cp deploy/systemd/gps-web.service deploy/systemd/gps-tcp.service deploy/systemd/gps-jobs.service /etc/systemd/system/
systemctl daemon-reload
echo "units geinstalleerd"

echo "=== 3. Services enable + start ==="
systemctl enable gps-web gps-jobs gps-tcp 2>&1 || true
systemctl start gps-web gps-jobs gps-tcp 2>&1 || true
sleep 6

echo "=== 4. Status ==="
for s in gps-web gps-jobs gps-tcp; do
  echo "--- $s ---"
  systemctl is-active $s || true
  systemctl is-enabled $s || true
done
echo "=== EINDE ==="
