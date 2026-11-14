# Runbook — Deploy op netcup VPS (Debian)

Context: netcup vServer, **Debian Minimal**, 4 GB RAM / 2 CPU / 64 GB schijf,
IPv4 `62.83.96.115`, Nuremberg. Toegang via SCP-Screen (VNC) met root.
Dit runbook vervangt de Hetzner/Ubuntu-stappen uit `DEPLOYMENT.md` waar die
afwijken. Geschreven op 2026-11-06.

> **Status:** klaar om uit te voeren. Elke stap is een commando dat je in de
> SCP-Screen (of SSH) plakt. Stop bij elke fout en meld die — niet doorgaan.

---

## Stap 0 — Eerste toegang (je hebt dit al gedaan)

- SCP-login → **Screen** → root wachtwoord uit de mail → `passwd` (nieuw wachtwoord).
- Bevestig OS: `cat /etc/os-release` → moet `Debian` tonen.

## Stap 1 — Schijf volledig benutten (netcup: "Small Partition")

netcup levert Debian met een kleine root-partitie; de rest is onbenut.

```bash
lsblk                       # bekijk welke partitie/schijf over is (bv. vda)
df -h /                     # huidige root-grootte
```

Als er onbenutte ruimte is (bijv. `vda` met vrije space na de partitie):

```bash
# Voorbeeld voor partitie vda2 (PAS AAN op basis van lsblk!)
growpart /dev/vda 2        # uitbreiden (apt install cloud-guest-utils als ontbreekt)
resize2fs /dev/vda2        # filesystem uitbreiden
df -h /                    # controleer: moet ~64GB tonen
```

> Als `growpart` niet bestaat: `apt update && apt install -y cloud-guest-utils`.
> Twijfel je over de partitie? Plak de output van `lsblk` en `df -h` hier —
> niet raden.

## Stap 2 — SSH-sleutel (zodat je VNC niet meer nodig hebt)

Op je **Windows-machine** (PowerShell):

```powershell
# Als je nog geen sleutel hebt:
ssh-keygen -t ed25519 -C "gps-deploy" -f $env:USERPROFILE\.ssh\id_ed25519 -N '""'
type $env:USERPROFILE\.ssh\id_ed25519.pub
```

Kopieer de output (`ssh-ed25519 AAAA... gps-deploy`). Dan in **SCP-Screen**
op de server:

```bash
mkdir -p ~/.ssh && chmod 700 ~/.ssh
echo 'PLAK_HIER_JOUW_PUB_KEY' >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

Vanaf nu: `ssh root@62.83.96.115`.

## Stap 3 — Basispakketten + Node.js 22

```bash
apt update && apt -y upgrade
apt -y install curl git postgresql nginx libnginx-mod-stream ufw rsync
curl -fsSL https://deb.nodesource.com/setup_22.x | -E bash -
apt -y install nodejs
node -v    # moet v22.x tonen
```

> `libnginx-mod-stream` is op Debian hetzelfde pakket als op Ubuntu — de
> stream-module voor de GPS TCP-proxy (poort 5556 → 5027).

## Stap 4 — Gebruiker + mappen

```bash
useradd -r -s /usr/sbin/nologin gps || true
mkdir -p /opt/gps-tracking-system /etc/gps-tracking /var/backups/gps-tracking
```

## Stap 5 — Code overzetten

Vanaf je **Windows-machine** (PowerShell, in de projectmap):

```powershell
rsync -az --exclude node_modules --exclude .next --exclude .git `
  -e "ssh -i $env:USERPROFILE\.ssh\id_ed25519" `
  ./ root@62.83.96.115:/opt/gps-tracking-system/
```

Of handmatig: `git clone <repo>` op de server als je repo publiek/privaat is.

Op de **server**:

```bash
cd /opt/gps-tracking-system
chown -R gps:gps /opt/gps-tracking-system
sudo -u gps npm ci
```

## Stap 6 — Database

```bash
sudo -u postgres createdb gps_tracking
sudo -u postgres psql -c "CREATE USER gps WITH PASSWORD 'VERVANG_DIT_MET SterkWachtwoord123!';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE gps_tracking TO gps;"
sudo -u postgres psql -d gps_tracking -c "GRANT ALL ON SCHEMA public TO gps;"
```

## Stap 7 — Environment-bestanden

```bash
# Web-app
cp .env.example /etc/gps-tracking/gps-web.env
# TCP-server
cp .env.example /etc/gps-tracking/gps-tcp.env
chown root:gps /etc/gps-tracking/*.env && chmod 600 /etc/gps-tracking/*.env
```

**Handmatig invullen** in `/etc/gps-tracking/gps-web.env` (via `nano`):

| Variabele | Waarde |
|---|---|
| `DATABASE_URL` | `postgresql://gps:<WACHTWOORD>@localhost:5432/gps_tracking` |
| `ADMIN_EMAIL` | jouw e-mail |
| `ADMIN_USERNAME` | `admin` |
| `ADMIN_PASSWORD` | sterk wachtwoord (min. 12 tekens) |
| `TELTONIKA_INGEST_KEY` | `openssl rand -hex 32` (uitvoeren, plakken) |
| `APP_URL` | `https://JOUW-DOMAIN` (of `http://62.83.96.115` tijdelijk) |

In `/etc/gps-tracking/gps-tcp.env`:

| Variabele | Waarde |
|---|---|
| `WEB_INGEST_URL` | `http://127.0.0.1:3000/api/ingest/teltonika` |
| `TELTONIKA_INGEST_KEY` | dezelfde key als web |
| `GPS_TCP_PORT` | `5027` |

> ⚠️ **Nog geen domein?** Zie Stap 9 — HTTPS/TLS vereist een domein. Voor
> eerste testen kun je ook direct op IP werken (Stap 9, variant B).

## Stap 8 — Migratie, seed, build

```bash
cd /opt/gps-tracking-system
sudo -u gps npx prisma migrate deploy
sudo -u gps npm run db:seed          # admin-account uit env
sudo -u gps npm run build
```

## Stap 9 — Domein + TLS (nodig voor HTTPS en FMC920-TLS)

**Variant A — je hebt een domein** (aanbevolen):
1. DNS A-record → `62.83.96.115` (via je registrar of netcup CloudDNS).
2. ```bash
   apt -y install certbot python3-certbot-nginx
   # nginx eerst starten met placeholder-cert (zie Stap 10), dan:
   certbot --nginx -d JOUW-DOMAIN
   ```
3. `gps-web.conf` en `gps-tcp-stream.conf`: `gps.example.com` → jouw domein.

**Variant B — alleen IP (tijdelijk, geen FMC920-TLS):**
- Werk met self-signed cert of IP-only config; **FMC920 kan dan nog geen TLS
  gebruiken** — alleen geschikt voor testen met plain TCP binnen vertrouwde
  context (niet aanbevolen voor productie; zie DEPLOYMENT.md §11).

## Stap 10 — nginx

```bash
cp deploy/nginx/gps-web.conf /etc/nginx/sites-available/gps-tracking
ln -sf /etc/nginx/sites-available/gps-tracking /etc/nginx/sites-enabled/
# stream-blok toevoegen aan /etc/nginx/nginx.conf (of apart include-bestand):
#   include /etc/nginx/modules-enabled/*.conf;   # bovenaan als nog niet aanwezig
#   stream { include /opt/gps-tracking-system/deploy/nginx/gps-tcp-stream.conf; }
nginx -t && systemctl reload nginx
```

Let op: de stream-config moet in het **hoofd-`nginx.conf`**-blok `stream {}`
staan, niet in een `sites-enabled`-bestand.

## Stap 11 — systemd-services

```bash
cp deploy/systemd/gps-web.service deploy/systemd/gps-tcp.service deploy/systemd/gps-jobs.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now gps-web gps-tcp gps-jobs
systemctl status gps-web gps-tcp gps-jobs --no-pager
```

## Stap 12 — Firewall (netcup heeft ook een SCP-firewall!)

```bash
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 5556/tcp comment 'Teltonika AVL'
ufw enable
```

⚠️ **Dubbele firewall:** netcup heeft een firewall in het SCP (Server Control
Panel → Firewall). Zet daar óók poorten 80/443/5556 open, anders blokkeert
die vóór `ufw`. Poort 22 laten staan zoals het nu is.

## Stap 13 — Verificatie

```bash
curl -fsS http://127.0.0.1:3000/api/health          # web-app
curl -fsS https://JOUW-DOMAIN/api/health/ready       # via nginx (na certbot)
journalctl -u gps-tcp -n 20                          # TCP-service
ss -tlnp | grep -E '3000|5027|80|443|5556'           # poorten
```

Van buitenaf: `curl -I https://JOUW-DOMAIN/` → 200/301.

## Stap 14 — FMC920 koppelen

1. Configurator → Server: domein = jouw DNS-naam, poort `5556`, TLS = `TLS with domain`
   (na certbot), APN van SIM, Data Protocol = **Codec 8 Extended**, ACK = AVL.
2. In de web-app: `/app/devices` → **+ Apparaat** → IMEI → **Connect** →
   voertuig koppelen.
3. `journalctl -u gps-tcp -f` → wachten op verbinding; SMS `  getrecord`
   (twee spaties vooraf) naar het SIM-nummer om een batch te triggeren.

## Stap 15 — Backups (geen Hetzner Storage Box)

netcup heeft geen Storage Box. Opties:
1. **netcup Backup** (betaald, via SCP → Backups) voor volledige VPS-snapshots.
2. **Eigen pg_dump cron** naar een externe doel (bv. een andere server/objstore):
   ```bash
   crontab -e
   # 0 2 * * * /opt/gps-tracking-system/deploy/scripts/backup.sh
   ```
   `backup.sh` schrijft naar `/var/backups/gps-tracking` — verplaats die map
   periodiek naar offsite (rsync/scp naar andere machine).

---

## Verschillen met het oude plan (samenvatting)

| Onderdeel | Oud plan (Hetzner/Ubuntu) | Deze server (netcup/Debian) |
|---|---|---|
| OS | Ubuntu 24.04 | **Debian Minimal** (pakketnamen grotendeels gelijk) |
| RAM/schijf | 8 GB / 80 GB | **4 GB / 64 GB** — voldoende, 90d-retentie past (~25 GB) |
| Toegang | SSH-keys | **SCP-Screen → dan SSH-keys zetten (Stap 2)** |
| Firewall | alleen ufw | **ufw + netcup SCP-firewall (beide openen!)** |
| Backups | Hetzner Storage Box | **netcup Backup of eigen rsync-offsite** |
| Domein/TLS | gps.example.com | **jouw domein → certbot; IP-variant alleen test** |
