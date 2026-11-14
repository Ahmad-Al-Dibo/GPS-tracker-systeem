#!/bin/bash
# deploy/inspect-vps.sh — READ-ONLY VPS-inspectie voor pre-deployment
# Toont GEEN secrets: DATABASE_URL-wachtwoord wordt gemaskeerd.
set -u

echo "=== 1. DATABASE_URL (wachtwoord gemaskeerd) ==="
grep '^DATABASE_URL' /opt/gps-tracking-system/.env | sed -E 's#//([^:]+):[^@]+@#//\1:***@#'

echo "=== 2. Databases ==="
sudo -u postgres psql -lqt | cut -d'|' -f1

echo "=== 3. Rollen ==="
sudo -u postgres psql -tAc "SELECT rolname FROM pg_roles"

echo "=== 4. pg_hba.conf (lokaal, geen secrets) ==="
grep -vE '^#|^[[:space:]]*$' /etc/postgresql/17/main/pg_hba.conf

echo "=== 5. postgres hoorner-check: kan postgres lokaal? ==="
sudo -u postgres psql -tAc "SELECT current_user"

echo "=== EINDE ==="
