#!/bin/bash
# verify-https-partial.sh — READ-ONLY verificatie van wat ZONDER DNS al kan
set -u
PASS=0; FAIL=0
ok(){ echo "OK   $1"; PASS=$((PASS+1)); }
bad(){ echo "FAIL $1"; FAIL=$((FAIL+1)); }
H='Host: autonivo.nl'

echo "=== Health-endpoints via nginx ==="
c=$(curl -s -o /dev/null -w '%{http_code}' -H "$H" http://127.0.0.1/api/health)
[ "$c" = "200" ] && ok "/api/health -> 200" || bad "/api/health -> $c"
c=$(curl -s -o /dev/null -w '%{http_code}' -H "$H" http://127.0.0.1/api/health/live)
[ "$c" = "200" ] && ok "/api/health/live -> 200" || bad "/api/health/live -> $c"
c=$(curl -s -o /dev/null -w '%{http_code}' -H "$H" http://127.0.0.1/api/health/ready)
[ "$c" = "200" ] && ok "/api/health/ready -> 200 (DB ok)" || bad "/api/health/ready -> $c"
echo "ready-body: $(curl -s -H "$H" http://127.0.0.1/api/health/ready | head -c 160)"

echo "=== Login via nginx (backend, wachtwoord niet getoond) ==="
cd /opt/gps-tracking-system
APW=$(grep '^ADMIN_PASSWORD=' .env | cut -d= -f2- | tr -d '"')
AEM=$(grep '^ADMIN_EMAIL=' .env | cut -d= -f2- | tr -d '"')
BODY=$(mktemp /tmp/lb.XXXXXX)
printf '{"identifier":"%s","password":"%s"}' "$AEM" "$APW" > "$BODY"
c=$(curl -s -o /tmp/lr.json -w '%{http_code}' -H "$H" -H 'Content-Type: application/json' --data-binary @"$BODY" http://127.0.0.1/api/auth/login)
[ "$c" = "200" ] && ok "POST /api/auth/login via nginx -> 200" || bad "login -> $c"
# Cookie-vlaggen tonen (veilig: attributes, geen waarde)
echo "cookie-attributes: $(grep -io 'set-cookie: [^;]*;[^;]*;[^;]*' /tmp/lr.json 2>/dev/null | head -1)"
curl -s -D - -o /dev/null -H "$H" -H 'Content-Type: application/json' --data-binary @"$BODY" http://127.0.0.1/api/auth/login | grep -i 'set-cookie' | sed -E 's/(gps_session_id=)[^;]+/\1***REDACTED***/' | head -2
rm -f "$BODY" /tmp/lr.json

echo "=== Homepage + loginpagina via nginx ==="
c=$(curl -s -o /dev/null -w '%{http_code}' -H "$H" http://127.0.0.1/)
[ "$c" = "200" ] && ok "GET / -> 200" || bad "GET / -> $c"
c=$(curl -s -o /dev/null -w '%{http_code}' -H "$H" http://127.0.0.1/login)
[ "$c" = "200" ] && ok "GET /login -> 200" || bad "GET /login -> $c"

echo "=== Systemd services ==="
for s in gps-web gps-jobs gps-tcp nginx postgresql; do
  st=$(systemctl is-active $s)
  [ "$st" = "active" ] && ok "$s active" || bad "$s=$st"
done

echo "=== Poorten ==="
ss -tln | grep -q '127.0.0.1:3000' && ok "3000 gebonden op 127.0.0.1" || bad "3000 binding"
ss -tln | grep -q ':5027' && ok "5027 (GPS TCP) luistert" || bad "5027"
ss -tln | grep -q ':80' && ok "80 (nginx)" || bad "80"

echo "=== GPS TCP recente verbindingen (journal) ==="
journalctl -u gps-tcp --since '-30 min' --no-pager 2>/dev/null | grep -c 'new connection\|verbinding' | xargs -I{} echo "verbindingen laatste 30min: {}"

echo ""
echo "RESULTAAT: $PASS ok, $FAIL gefaald"
