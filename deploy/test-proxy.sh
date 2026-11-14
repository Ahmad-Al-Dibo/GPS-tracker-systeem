#!/bin/bash
# test-proxy.sh — READ-ONLY: test nginx → Next.js proxy met Host-headers
set -u
echo "--- via nginx (Host-header) ---"
curl -s -o /dev/null -w 'GET / Host=autonivo.nl -> %{http_code}\n' -H 'Host: autonivo.nl' http://127.0.0.1/
curl -s -o /dev/null -w 'GET /login Host=autonivo.nl -> %{http_code}\n' -H 'Host: autonivo.nl' http://127.0.0.1/login
curl -s -o /dev/null -w 'GET /api/health Host=autonivo.nl -> %{http_code}\n' -H 'Host: autonivo.nl' http://127.0.0.1/api/health
curl -s -o /dev/null -w 'GET / Host=www.autonivo.nl -> %{http_code}\n' -H 'Host: www.autonivo.nl' http://127.0.0.1/
echo "--- response-body health (eerste 150 tekens) ---"
curl -s -H 'Host: autonivo.nl' http://127.0.0.1/api/health | head -c 150
echo ""
echo "--- forward-headers aankomen bij app? (echo via health wordt niet gereflecteerd; check nginx access-log na 1 req) ---"
curl -s -o /dev/null -H 'Host: autonivo.nl' -H 'X-Test-Forward: check' http://127.0.0.1/api/health
grep -c 'autonivo' /var/log/nginx/access.log 2>/dev/null || echo "geen toegang tot access.log (niet kritiek)"
echo "EINDE"
