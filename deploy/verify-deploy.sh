#!/bin/bash
# deploy/verify-deploy.sh — READ-ONLY productieverificatie
# Toont geen secrets; login-test gebruikt wachtwoord uit .env zonder tonen.
set -u
PASS=0
FAIL=0
ok()   { echo "OK   $1"; PASS=$((PASS+1)); }
bad()  { echo "FAIL $1"; FAIL=$((FAIL+1)); }

echo "=== A. Services ==="
for s in gps-web gps-jobs gps-tcp; do
  st=$(systemctl is-active $s 2>&1)
  en=$(systemctl is-enabled $s 2>&1)
  if [ "$st" = "active" ] && [ "$en" = "enabled" ]; then ok "$s active+enabled"; else bad "$s (active=$st enabled=$en)"; fi
done

echo "=== B. Poorten (luistert de app?) ==="
if ss -tlnp | grep -q ':3000 '; then ok "poort 3000 (next)"; else bad "poort 3000"; fi
if ss -tlnp | grep -q ':5027 '; then ok "poort 5027 (avl-tcp)"; else bad "poort 5027"; fi
if ss -tlnp | grep -q ':8787 '; then ok "poort 8787 (tcp-dashboard)"; else bad "poort 8787"; fi

echo "=== C. HTTP vanaf de server ==="
h=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:3000/)
if [ "$h" = "200" ] || [ "$h" = "307" ]; then ok "homepage -> $h"; else bad "homepage -> $h"; fi
h=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:3000/login)
if [ "$h" = "200" ]; then ok "loginpagina -> 200"; else bad "loginpagina -> $h"; fi
h=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:3000/api/me)
if [ "$h" = "401" ]; then ok "API /api/me zonder sessie -> 401"; else bad "API /api/me -> $h"; fi

echo "=== D. Login met admin-credentials (wachtwoord niet getoond) ==="
cd /opt/gps-tracking-system
APW=$(grep '^ADMIN_PASSWORD=' .env | cut -d= -f2- | tr -d '"')
AEM=$(grep '^ADMIN_EMAIL=' .env | cut -d= -f2- | tr -d '"')
BODY_FILE=$(mktemp /tmp/login-body.XXXXXX)
trap 'rm -f "$BODY_FILE"' EXIT
printf '{"identifier":"%s","password":"%s"}' "$AEM" "$APW" > "$BODY_FILE"
CODE=$(curl -s -o /tmp/login-resp.json -w '%{http_code}' --max-time 10 \
  -H 'Content-Type: application/json' \
  --data-binary @"$BODY_FILE" \
  http://127.0.0.1:3000/api/auth/login)
if [ "$CODE" = "200" ]; then ok "POST /api/auth/login -> 200"; else bad "POST /api/auth/login -> $CODE"; fi
rm -f /tmp/login-resp.json "$BODY_FILE"
trap - EXIT
unset APW AEM

echo "=== E. Health-endpoint ==="
if [ -f src/app/api/health/route.ts ]; then
  h=$(curl -s --max-time 10 http://127.0.0.1:3000/api/health | head -c 200)
  echo "health: $h"
else
  echo "geen /api/health route (overgeslagen)"
fi

echo "=== F. Prisma/DB-fouten in logs? ==="
ERRS=$(journalctl -u gps-web -u gps-jobs -u gps-tcp --since "-10 min" --no-pager 2>/dev/null | grep -ciE 'P1000|P1001|P1003|prisma.*error|unhandled|exception' || true)
if [ "$ERRS" = "0" ]; then ok "geen Prisma/unhandled-fouten in laatste 10 min"; else bad "$ERRS verdachte regels in logs"; fi

echo ""
echo "RESULTAAT: $PASS ok, $FAIL gefaald"
