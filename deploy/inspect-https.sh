#!/bin/bash
# inspect-https.sh — READ-ONLY inspectie voor HTTPS-deployment (Fase 1)
# Toont geen secrets; alleen env-NAMEN.
set -u

echo "=== A. Nginx: includes + http-blok (websocket-map mogelijkheid) ==="
grep -nE 'include|http2|map ' /etc/nginx/nginx.conf | head -20

echo "=== B. Nginx default-site (bestaande, wordt NIET verwijderd) ==="
grep -E 'listen|server_name' /etc/nginx/sites-enabled/default

echo "=== C. systemd gps-web unit (ExecStart/binding) ==="
grep -E 'ExecStart|WorkingDirectory|User=|EnvironmentFile|Restart' /etc/systemd/system/gps-web.service

echo "=== D. Services status (vastlegging vóór wijzigingen) ==="
for s in gps-web gps-jobs gps-tcp nginx postgresql; do
  printf '%s: active=%s enabled=%s\n' "$s" "$(systemctl is-active $s)" "$(systemctl is-enabled $s 2>/dev/null || echo n.v.t.)"
done

echo "=== E. Listening poorten + process-gebruikers ==="
ss -tlnp | grep -E ':3000|:5027|:8787|:80 |:443|:5432' | sed 's/users:/users:/'

echo "=== F. Firewall (alleen lezen) ==="
ufw status 2>/dev/null | head -12 || echo "ufw niet beschikbaar"
iptables -L INPUT -n --line-numbers 2>/dev/null | head -8

echo "=== G. Env-NAMEN relevant voor URLs/cookies/auth (geen waarden) ==="
grep -oE '^[A-Z_]+' /opt/gps-tracking-system/.env | sort

echo "=== H. Projectdirectory permissies/eigenaar ==="
ls -ld /opt/gps-tracking-system
ls -l /opt/gps-tracking-system/.env

echo "=== I. Health-endpoints aanwezig? ==="
ls /opt/gps-tracking-system/src/app/api/health/ 2>/dev/null || echo "geen health-map"

echo "=== J. Next.js host-binding (uit journal) ==="
journalctl -u gps-web -n 20 --no-pager | grep -E 'Local|Network|Ready' | tail -3

echo "=== EINDE INSPECTIE ==="
