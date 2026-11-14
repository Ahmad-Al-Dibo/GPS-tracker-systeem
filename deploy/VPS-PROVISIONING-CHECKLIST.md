# VPS PROVISIONING CHECKLIST — GPS Tracking Platform (Phase 3A)

Status: infrastructure validation afgerond 2026-11-05. Nog NIET geprovisiond.
Elk item hieronder is een handmatige stap bij de daadwerkelijke inrichting.

---

## 1. Finale serverspecificatie

| Onderdeel | Keuze | Verificatie |
|---|---|---|
| Server | **Hetzner Cloud CX33** (Cost-Optimized) | 4 vCPU shared / 8 GB RAM / 80 GB NVMe / 20 TB traffic |
| Locatie | Falkenstein (FSN1) of Nuremberg (NBG1) | laagste latency naar NL/BE-devices |
| OS | **Ubuntu 24.04 LTS** (x86-64) | alle templates getoetst; nginx stream-module apart te installeren (zie §5) |
| Database | PostgreSQL 16 (Ubuntu-native) | alleen localhost |
| Node.js | 22 LTS (NodeSource) | Next.js 16 + teltonika-server |
| Services | gps-web (Next.js 3000), gps-tcp (AVL 5027), gps-jobs (worker) | systemd-units in `deploy/systemd/` |
| Proxy | nginx: HTTPS 443 + stream-proxy 5556→5027 | `deploy/nginx/` |

**Capaciteitsbewijs (gemeten):** 70 devices × 10s-rapportageprofiel = 420 records/min
getest → 420/420 duurzaam opgeslagen, alle ACKs correct, web-app gezond, 70
gelijktijdige TCP-sessies (batches verwerkt in 1,7–2,8s per ronde). 8 GB RAM is
ruim voldoende (gemeten piekbelasting: Next.js + node + PostgreSQL < 2 GB).

## 2. Maandkostenraming (ex. btw, nov 2026)

| Post | Bedrag | Opmerking |
|---|---|---|
| Hetzner CX33 | **€ 8,99 /mnd** | € 0,0144/uur, maandcap; incl. primaire IPv4 + 20 TB traffic (prijsbron 2026-11-02/05) |
| Hetzner Backups (optioneel) | + 20% = € 1,80 | snapshots door Hetzner; eigen pg_dump-backup is primair |
| Offsite backup-opslag (aanbevolen) | € 3,29–4,50 | Hetzner Storage Box BX11 of object storage |
| DNS-domein | € 0–1 | naar keuze registrar |
| **Totaal** | **± € 12–15 /mnd** | |

⚠️ **Risico:** de Cost-Optimized-lijn (CX) stond okt-2026 bij Hetzner als "tijdelijk
niet beschikbaar" gemarkeerd. Valideer beschikbaarheid vóór aankoop. Fallback:
**CAX21** (Arm64, 4/8/80, € 10,99) of **CX43** (8/16/160, € 16,49).

## 3. Vereiste poorten

| Poort | Protocol | Richting | Doel | Openbaar? |
|---|---|---|---|---|
| 22 | TCP | in | SSH-beheer | Ja, bij voorkeur IP-gefilterd |
| 80 | TCP | in | certbot HTTP-01 + redirect naar HTTPS | Ja (tijdelijk) |
| 443 | TCP | in | HTTPS web-app | Ja |
| **5556** | TCP | in | **Teltonika AVL (via nginx stream → 5027)** | Ja (of alleen privé-APN) |
| 3000 | TCP | loopback | Next.js intern | **Nee** |
| 5027 | TCP | loopback | AVL-listener intern | **Nee** |
| 8787 | TCP | loopback | gps-tcp debug-dashboard | **Nee** |
| 5432 | TCP | loopback | PostgreSQL | **Nee** |

## 4. DNS-vereisten

| Record | Type | Waarde | TTL | Doel |
|---|---|---|---|---|
| `gps.example.com` | A (+ AAAA) | VPS publiek IP | 300 → 3600 | Web HTTPS |
| `gps.example.com` | A (zelfde) | zelfde IP | 300 → 3600 | AVL-TLS-domein (device gebruikt hostnaam:5556; één naam volstaat) |
| Optioneel: `gps-tcp.example.com` | A | zelfde IP | 300 | aparte naam voor device-TLS-certificaat-SAN |

Let op: het FMC920-TLS-certificaat moet de **hostnaam dekken** (SAN) die in
parameter 2004 (GPRS Domain) staat. Eén hostname voor beide paden is eenvoudigst.

## 5. TLS-vereisten (transport — WP11)

**Beleid: onversleutelde publieke GPS-TCP is niet toegestaan.** Kies TLS (optie A)
of privé-APN/VPN (optie B) — zie DEPLOYMENT.md §11.

Serverzijde (getest/verifieerd in code):
- `teltonika/server.mjs` activeert TLS met `GPS_TLS_CERT`/`GPS_TLS_KEY`;
  TLS 1.2 minimum, RSA-compatibele cipher-suite ingesteld.
- Certificaat: **RSA 2048** (ECDSA niet vertrouwd bij oudere device-implementaties),
  uitgegeven door publieke CA (Let's Encrypt) voor de GPS-hostnaam, of eigen CA
  met upload naar het apparaat.

Apparaatzijde (FMC920 — **NIET fysiek getest; vereist apparaattest**):
- Configurator → Server → TLS: `TLS with domain` of `TLS with domain and CA cert`.
- Parameter 2006: `2` (TLS+domain) of `3` (TLS+CA) via SMS `  setparam 2006:2`.
- Bij eigen CA: CA-certificaat uploaden via Configurator → SSL Settings.
- **Aandachtspunten:** device-RTC moet redelijk kloppen (certificaatdatumvalidatie);
  SNI-ondersteuning onbekend → cert moet op de standaard servernaam werken;
  cipher-compatibiliteit pas bevestigd na fysieke test.
- **Acceptatiecriterium vóór productie:** één fysieke FMC920 verbindt met TLS en
  levert records met groene ACK.

## 6. Opslagraming (10s-rijinterval bewegend, 70 devices)

**Aannames (expliciet):** 8u/dag rijden @ 10s (3.600 rec/uur) = 2.880/device/dag;
16u stilstaan @ 60s = 960/device/dag → ±3.840 records/device/dag →
**±268.800 records/dag** vlootbreed. Rij-effectief incl. 3 indexen ±950 B.

| Periode | Records | Database | Backups (dagelijks, gz ≈ 18%) |
|---|---|---|---|
| 30 dagen | ± 8,1 mln | **± 7,7 GB** | ± 1,5 GB |
| 90 dagen (standaard retentie) | ± 24 mln | **± 23 GB** | ± 4,5 GB |
| 365 dagen (zonder retentie) | ± 98 mln | **± 93 GB** ⚠️ > 80 GB schijf | ± 18 GB |

**Conclusies:**
- Met `pointRetentionDays=90` (standaard) past steady-state (23–25 GB data +
  WAL/temp + backups) ruim op 80 GB NVMe.
- Retentie > ~280 dagen **past niet** op 80 GB → schijf-upgrade (CX43 160 GB,
  € 16,49) of lagere retentie vereist.
- Backups naar **offsite** (Storage Box), niet alleen op de VPS.
- Retention-job draait dagelijks (gps-jobs) en is getest (idempotent, batch).

## 7. Template-verificatie (taken 1–5, uitgevoerd)

| Item | Bevinding | Actie |
|---|---|---|
| systemd Ubuntu 24.04 | Units syntactisch correct; `postgresql.service` bestaat (postgresql-common); `User=gps` moet aangemaakt | aangepast: `gps-jobs` gebruikt absolute `node_modules/.bin/tsx` i.p.v. npx |
| Startup order | gps-web `Requires=postgresql` ✓; gps-tcp `After=gps-web` zonder harde dependency (tolereert web-downtime → ACK 0 + device-retry) ✓; gps-jobs `Requires=postgresql` ✓ | geen |
| nginx HTTP | proxy-config geldig; `listen 443 ssl http2` correct voor nginx 1.24 (op 1.25+ `http2 on` apart) | geen (bij upgrade herzien) |
| nginx stream | **Ubuntu-nginx vereist `libnginx-mod-stream`** (dynamische module) | stappen toegevoegd aan checklist §9 |
| TLS cert handling | server: min TLS 1.2 + RSA-ciphers ingesteld; cert/key via env | ✓ gedaan |
| FMC920 TLS | eisen gedocumenteerd (§5); **compatibiliteit niet bewezen zonder apparaattest** | fysieke test verplicht vóór productie |
| 10s-loadprofiel | **Uitgevoerd**: 70 devices × 6 rondes @ 10s → 420/420 ACK + opslag | ✓ bewezen |

## 8. Organisatie-eigenaarschap (toekomstbestendigheid)

- Huidig model: **één bedrijf** = één organisatie; per-user `ownerUserId` op
  devices/voertuigen/bronnen; admin = volledig overzicht; `Settings.orgKey="default"`.
- Cross-user toegang is afgedwongen (14/14 autz-tests) — voldoende voor single-tenant.
- **Pad naar organisatie-isolatie (later):** `Organization`-model toevoegen;
  `ownerUserId` → `orgId` + membership-tabel; unieke constraints op
  (orgId, IMEI)/(orgId, naam); API-keys en sessies per org. Nu geen code
  vereist; schema is hierop voorbereid (additieve migraties, geen destructie).
- Openstaand: personen/locaties/routes/taken zijn org-breed (geen owner) —
  acceptabel binnen één bedrijf; kruisgebruik binnen de organisatie mogelijk.

## 9. Deployment-commanden (uitvoerbaar na aanschaf)

```bash
# --- 1. Serverbasis ---
sudo apt update && sudo apt -y upgrade
sudo apt -y install curl git postgresql nginx libnginx-mod-stream ufw
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt -y install nodejs
sudo useradd -r -s /usr/sbin/nologin gps || true

# --- 2. Applicatie ---
sudo mkdir -p /opt/gps-tracking-system /etc/gps-tracking /var/backups/gps-tracking
sudo rsync -a --exclude node_modules --exclude .next ./ /opt/gps-tracking-system/
sudo chown -R gps:gps /opt/gps-tracking-system
cd /opt/gps-tracking-system && sudo -u gps npm ci

# --- 3. Database ---
sudo -u postgres createdb gps_tracking
sudo -u postgres psql -c "CREATE USER gps WITH PASSWORD '<STERK_WOORD>';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE gps_tracking TO gps;"
sudo -u postgres psql -d gps_tracking -c "GRANT ALL ON SCHEMA public TO gps;"

# --- 4. Configuratie (handmatig invullen!) ---
sudo cp .env.example /etc/gps-tracking/gps-web.env   # DATABASE_URL, ADMIN_*, TELTONIKA_INGEST_KEY=$(openssl rand -hex 32)
sudo cp .env.example /etc/gps-tracking/gps-tcp.env    # GPS_TLS_*, WEB_INGEST_URL=http://127.0.0.1:3000/api/ingest/teltonika
sudo chown root:gps /etc/gps-tracking/*.env && sudo chmod 600 /etc/gps-tracking/*.env

# --- 5. Migratie + build ---
sudo -u gps npx prisma migrate deploy
sudo -u gps npm run db:seed
sudo -u gps npm run build

# --- 6. TLS-certificaat ---
sudo apt -y install certbot python3-certbot-nginx
sudo certbot --nginx -d gps.example.com

# --- 7. nginx ---
sudo cp deploy/nginx/gps-web.conf /etc/nginx/sites-available/gps-tracking
sudo ln -sf /etc/nginx/sites-available/gps-tracking /etc/nginx/sites-enabled/
# stream-blok uit deploy/nginx/gps-tcp-stream.conf toevoegen aan /etc/nginx/nginx.conf
# (of load_module modules/ngx_stream_module.so bovenaan nginx.conf)
sudo nginx -t && sudo systemctl reload nginx

# --- 8. Services ---
sudo cp deploy/systemd/gps-web.service deploy/systemd/gps-tcp.service deploy/systemd/gps-jobs.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now gps-web gps-tcp gps-jobs

# --- 9. Firewall ---
sudo ufw allow 22/tcp && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp
sudo ufw allow 5556/tcp comment 'Teltonika AVL'
sudo ufw enable

# --- 10. Backup-cron ---
sudo crontab -e   # 0 2 * * * /opt/gps-tracking-system/deploy/scripts/backup.sh

# --- 11. Verificatie ---
curl -fsS https://gps.example.com/api/health/ready
sudo journalctl -u gps-tcp -n 20
```

## 10. Handmatige stappen die GEEN commando kunnen zijn

1. Hetzner-account + betaling + CX33-aanmaak (controleer beschikbaarheid Cost-Optimized).
2. SSH-sleutels instellen; wachtwoord-auth uitschakelen.
3. Domein kiezen + DNS-records aanmaken (§4).
4. `.env`-waarden invullen (DATABASE_URL-wachtwoord, ADMIN_PASSWORD,
   TELTONIKA_INGEST_KEY genereren, CARTO-key optioneel).
5. TLS-keuze vastleggen (publiek certificaat vs eigen CA) en bij eigen CA:
   CA-certificaat exporteren voor upload naar devices.
6. Offsite-backupdoel aanmaken (Storage Box) + sleutel in backup.sh.
7. **FMC920-apparaten configureren** (Configurator/SMS): domein `gps.example.com`,
   poort 5556, TLS-modus, APN van de SIM; daarna IMEI's verzamelen.
8. Per apparaat: registreren op `/app/devices` → **Connect** → voertuig koppelen.
9. **Fysieke TLS-compatibiliteitstest** met één apparaat vóór uitrol van de vloot.
10. Eerste backup-restore-drill uitvoeren (restore.sh op testdatabase).
11. Monitoring instellen (externe uptime-check op `/api/health/ready`).
12. Rapportage-interval-afstemming: bij 10s-profiel `DEVICE_ONLINE_S=300` en
    `DEVICE_OFFLINE_S=900` instellen in de env (nu 7200/21600 — te ruim voor
    snelle rapportage; zie risico's).

## 11. Risico's en mitigaties

| Risico | Impact | Mitigatie |
|---|---|---|
| CX33 niet bestelbaar (Cost-Optimized tijdelijk uit) | Middel | Fallback CAX21 (€10,99) of CX43 (€16,49); zelfde stappen |
| FMC920-TLS onverenigbaar (cipher/SNI/klok) | Hoog | Fysieke test vóór vlootuitrol; fallback privé-APN/VPN of plain-TCP binnen VPN; RSA-cert + TLS1.2-ciphers zijn de veiligste combinatie |
| Device-RTC verkeerd → certificaatvalidatie faalt | Middel | RTC synchroniseren vóór TLS-inschakeling (device fixt via GNSS; of tijdelijk CA met ruime geldigheid) |
| Database groeit sneller dan gepland (langere rijtijd) | Middel | Retentie 90d standaard; monitoring van schijfruimte; bij >70% opschonen/opschalen; `pointRetentionDays` verlagen |
| Backup nooit getest | Hoog | Verplichte restore-drill (checklist §10.10) bij ingebruikname |
| Publieke TCP-poort 5556 gescand/geflood | Middel | IMEI-allowlist (unknown rejected), nginx `limit_conn` per IP, fail2ban; TLS versleutelt payload |
| Downtime web-app tijdens device-pushes | Laag | Devices herverzenden; dedupe voorkomt duplicaten; ACK 0 = device retry (getest) |
| Eén tenant-grens later nodig | Laag | Organisatie-isolatie-pad gedocumenteerd (§8); schema additief uitbreidbaar |
| 10s-profiel te ruime offline-drempels | Laag | `DEVICE_ONLINE_S=300` / `DEVICE_OFFLINE_S=900` zetten (env-configuratie, geen code) |

## 12. Klaar-voor-aankoop-oordeel

De CX33 (4 vCPU / 8 GB / 80 GB) is **capaciteitstechnisch bewezen** voor 70
FMC920's op 10s-rapportage (getest) en financieel passend (± € 12–15/mnd
totaal). Openstaand vóór productie: TLS-fysieke apparaattest, restore-drill en
de env-aanpassing van de device-drempels. Alle overige stappen zijn uitvoerbaar
met dit checklist.
