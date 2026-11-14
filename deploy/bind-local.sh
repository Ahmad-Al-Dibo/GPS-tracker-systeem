#!/bin/bash
# bind-local.sh — Fase 4: bind gps-web aan 127.0.0.1:3000 (backups bestaan al)
set -euo pipefail
UNIT=/etc/systemd/system/gps-web.service

echo "=== Voor wijziging ==="
grep ExecStart $UNIT

echo "=== Wijzigen: -H 127.0.0.1 ==="
sed -i 's|ExecStart=/usr/bin/npm start$|ExecStart=/usr/bin/npm start -- -H 127.0.0.1|' $UNIT
grep ExecStart $UNIT

systemctl daemon-reload
systemctl restart gps-web
sleep 6

echo "=== Status ==="
systemctl is-active gps-web
journalctl -u gps-web -n 8 --no-pager | tail -8

echo "=== Binding (verwacht 127.0.0.1:3000, NIET 0.0.0.0) ==="
ss -tlnp | grep 3000

echo "=== Nginx-proxy na wijziging ==="
curl -s -o /dev/null -w 'proxy / -> %{http_code}\n' -H 'Host: autonivo.nl' http://127.0.0.1/
curl -s -o /dev/null -w 'proxy /api/health -> %{http_code}\n' -H 'Host: autonivo.nl' http://127.0.0.1/api/health

echo "=== Andere services onaangetast? ==="
for s in gps-jobs gps-tcp nginx postgresql; do printf '%s=%s\n' $s "$(systemctl is-active $s)"; done
echo "EINDE"
