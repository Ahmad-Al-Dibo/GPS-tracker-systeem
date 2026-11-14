# DEPLOYMENT.md — GPS Tracking Platform

Productie-deployment-handleiding voor Ubuntu 24.04 LTS. Dit document beschrijft
de voorbereiding; de daadwerkelijke server-inrichting valt buiten deze fase.

## 1. Services

| Service | Component | Poort | Proces |
|---|---|---|---|
| `gps-web` | Next.js app (frontend + API) | 3000 (intern) → nginx 443 | `npm start` |
| `gps-tcp` | Teltonika AVL TCP-listener (`teltonika/server.mjs`) | 5027 (intern) → nginx-stream 5556 publiek | `node teltonika/server.mjs` |
| `gps-jobs` | Background worker (deadline-check + retention) | — | `npx tsx scripts/jobs.ts` |
| PostgreSQL 16/18 | Database | 5432 (alleen localhost) | `postgresql.service` |
| Nginx | HTTPS-reverse-proxy + TCP-stream | 443 + 5556 | `nginx.service` |

De GPS TCP-service is volledig onafhankelijk van de frontend; hij duwt
gedecodeerde records via HTTP naar de web-app (`WEB_INGEST_URL`) en ACK't pas
na duurzame opslag.

## 2. Environment-variabelen

Alle configuratie staat in `.env.example` (kopieer naar `/etc/gps-tracking/*.env`).
Verplicht: `DATABASE_URL`, `TELTONIKA_INGEST_KEY`, `ADMIN_EMAIL`,
`ADMIN_USERNAME`, `ADMIN_PASSWORD`. Optioneel maar aanbevolen: `APP_URL`,
`NEXT_PUBLIC_CARTO_KEY`, GPS-timeouts, TLS-certificaatpaden.
Productie- en dev-configuratie zijn gescheiden via aparte env-files; **zet
geheimen nooit in frontend-variabelen** (`NEXT_PUBLIC_*` wordt gebundeld).
Ongebruikte legacy-variabelen (`AUTH_SECRET`, `ADMIN_BUILD_API_KEY`) zijn
gedocumenteerd in `.env.example` en mogen verwijderd.

## 3. Installatiestappen

```bash
sudo useradd -r -s /usr/sbin/nologin gps
sudo mkdir -p /opt/gps-tracking-system /etc/gps-tracking /var/backups/gps-tracking
sudo cp -r . /opt/gps-tracking-system && sudo chown -R gps:gps /opt/gps-tracking-system
cd /opt/gps-tracking-system
sudo -u gps npm ci
# env-files plaatsen (permissies 600, eigenaar root:gps)
sudo cp .env.example /etc/gps-tracking/gps-web.env   # invullen!
sudo cp .env.example /etc/gps-tracking/gps-tcp.env    # invullen (subset)
sudo chown root:gps /etc/gps-tracking/*.env && sudo chmod 600 /etc/gps-tracking/*.env
```

## 4. Database + migraties

```bash
sudo -u postgres createdb gps_tracking
sudo -u postgres psql -c "CREATE USER gps WITH PASSWORD '<STERK_WOORD>';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE gps_tracking TO gps;"
sudo -u gps npx prisma migrate deploy   # past alle migraties toe
sudo -u gps npm run db:seed             # admin-account (wachtwoord uit env)
sudo -u gps npm run build
```

**Migratiestrategie (WP6 device-registry):** alle migraties zijn additief en
omkeerbaar; `imei` werd nullable (SOFTWARE-apparaten), `device_type`,
`simulator_id`, `owner_user_id` toegevoegd, `record_hash` + unieke
dedupe-constraint op `(device_id, record_hash)`. Bestaande rijen: alle devices
worden `HARDWARE`, bestaande punten hebben `record_hash = NULL` (geen
dedupe-restrictie op legacy-data). Bestaande software-trackers (IngestSource
met `trackerSource='app'`) blijven ongewijzigd werken via `/api/ingest`
(API-compatibiliteit bewaard); koppeling aan `GpsDevice` kan later via
`simulatorId`. Rollback: kolommen zijn toevoegingen — `ALTER TABLE ... DROP
COLUMN` herstelt de oude staat zonder data-verlies.

## 5. Services starten

```bash
sudo cp deploy/systemd/gps-*.service /etc/systemd/system/
sudo cp deploy/nginx/gps-web.conf /etc/nginx/sites-available/gps-tracking
sudo ln -s /etc/nginx/sites-available/gps-tracking /etc/nginx/sites-enabled/
# stream-config toevoegen aan /etc/nginx/nginx.conf (stream { ... } blok)
sudo nginx -t && sudo systemctl reload nginx
sudo systemctl daemon-reload
sudo systemctl enable --now gps-web gps-tcp gps-jobs
```

Restart-beleid: alle drie `Restart=always` (gps-tcp `RestartSec=3` — devices
herverbinden automatisch; niet-geACKte records worden herverzonden en
gededupet via `record_hash`).

## 6. Firewall

```bash
sudo ufw allow 22/tcp
sudo ufw allow 443/tcp
sudo ufw allow 5556/tcp comment 'Teltonika AVL'
sudo ufw enable
```
PostgreSQL (5432) **niet** publiek openen. De interne poorten 3000/5027/8787
blijven op localhost (nginx stream proxied 5556 → 5027).

## 7. Health-checks

| Endpoint | Doel |
|---|---|
| `GET /api/health/live` | Liveness — proces draait (restart-indicator) |
| `GET /api/health/ready` | Readiness — 503 zolang DB onbereikbaar |
| `GET /api/health` | Samengesteld: DB + optioneel de GPS TCP-service (`GPS_TCP_HEALTH_URL`) |
| `GET :8787/health` | GPS TCP-service (open verbindingen, gekende devices) |

Monitoring: externe uptime-check op `/api/health/ready`; `systemctl status`
voor de services.

## 8. Logs

Alle services loggen structured JSON naar journald:
```bash
journalctl -u gps-tcp -f          # verbindings-/AVL-events (met IMEI)
journalctl -u gps-web -f          # requests (X-Request-Id), errors
journalctl -u gps-jobs -f         # deadline/retention
```
Rotatie via journald (`SystemMaxUse=` in `/etc/systemd/journald.conf`).
Raw hex-dumps alleen met `GPS_LOG_RAW=1` (debug). **Nooit** worden
wachtwoorden/API-keys/geheimen gelogd.

## 9. Backup + herstel

```bash
sudo crontab -e   # 0 2 * * * /opt/gps-tracking-system/deploy/scripts/backup.sh
```
- Backups: `pg_dump --format=custom`, gzip, 30 dagen retentie
  (`BACKUP_KEEP_DAYS`), permissies 600 in `/var/backups/gps-tracking`.
- Herstel: `deploy/scripts/restore.sh <dump>` — diensten eerst stoppen
  (`systemctl stop gps-web gps-tcp gps-jobs`), na herstel `npx prisma
  migrate deploy` controleren, dan starten.
- Optioneel WAL-archivering voor point-in-time recovery (aanbevolen bij
  productie-garanties).

## 10. Retention-beleid

`Settings.pointRetentionDays` (standaald 90) en `Settings.eventRetentionDays`
(standaald 30) sturen de dagelijkse retention-job (`gps-jobs`):
- IngestPoints ouder dan de cutoff worden batch-gewijs verwijderd
  (1000/keer); tracking-geschiedenis korter dan de retentie blijft volledig.
- Alleen events met status `resolved`/`dismissed` worden opgeruimd; open
  events blijven altijd staan.
- Devices, voertuigen en personen worden NOOIT door de retention-job
  aangeraakt. Idempotent: dubbele uitvoering verwijdert niets extra.

## 11. Network security — GPS-transport (WP11)

**Een publieke onversleutelde TCP-poort is NIET acceptabel voor productie.**
Kies één van onderstaande (op volgorde van voorkeur):

### Optie A — TLS op de AVL-listener (ondersteund door de server)
`teltonika/server.mjs` ondersteunt `node:tls` via:
```
GPS_TLS_CERT=/etc/gps/tls/server.crt
GPS_TLS_KEY=/etc/gps/tls/server.key
```
FMC920-configuratie (Teltonika Configurator → Server):
- **TLS**: `TLS with domain` (of `TLS with domain and CA cert`)
- Domein = de DNS-naam van de GPS-poort (bv. `gps.example.com`)
- Servercertificaat: gebruik een publiek CA-certificaat (Let's Encrypt) voor
  de GPS-DNS-naam, of upload een eigen CA via `SSL Settings` (CA-certificaat
  installeert het apparaat als trust-anchor).
- Configurator-parameter 2006: `2` (TLS with domain) / `3` (TLS+CA) via SMS:
  `  setparam 2006:2` (twee spaties vooraf).
- Poort aanpassen: parameter 2005 (bv. `2005:5556`).

### Optie B — Prive-netwerk (VPN/APN)
- Prive APN van de SIM-provider; GPS-verkeer blijft binnen het provider-netwerk
  (geen publieke TCP-poort nodig). Server reachable via prive-IP/VPN-tunnel
  (WireGuard tussen VPS en provider-APN).
- Minpunt: afhankelijk van provider; configuratie per SIM.

### Optie C — TLS via nginx stream (niet aanbevolen als eindpunt)
nginx `stream` met `proxy_ssl` naar een TLS-backend; de device-TLS-terminatie
blijft dan op node (optie A) of eindigt niet (plain) — alleen combineren met
prive-netwerk.

**Beleid:** draai productie met Optie A (TLS) of Optie B (prive-APN). Zonder
een daarvan is de transportlaag niet productie-klaar (gezien als release
blocker voor publieke internet-exposure).

## 12. Device-configuratie voor productie (FMC920)

In Teltonika Configurator (of via SMS `  setparam ...`):
| Parameter | Waarde |
|---|---|
| 2004 (GPRS Domain) | `gps.example.com` (productie-DNS) |
| 2005 (Port) | `5556` |
| 2006 (Protocol/TLS) | `0` = TCP, `2` = TLS met domein (aanbevolen) |
| 2007 (APN) | APN van de SIM-provider |
| Data Protocol | Codec 8 Extended |
| ACK Type | AVL |

Na koppeling: registreer de IMEI op `/app/devices`, klik **Connect**, koppel
aan het voertuig. Controleer via `journalctl -u gps-tcp` of records binnenkomen.

## 13. Bekende beperkingen

- Zie het eindrapport van Phase 2 voor de classificatie per work package.
- Real-time updates geschieden via polling (5–30s); SSE/WebSocket is een
  toekomstige optimalisatie.
- Software-trackers (IngestSource `trackerSource='app'`) zijn niet volledig
  gemigreerd naar `GpsDevice`; API-compatibiliteit is bewaard.
