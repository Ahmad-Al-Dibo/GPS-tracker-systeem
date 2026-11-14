# Opstarten — Snel aan de slag

## 1. Database starten

```powershell
net start postgresql-x64-18
```

## 2. Website starten

```powershell
cd D:\AhmadAlDibo-WORKSPACE\Real-Work\GPS-tracking-system
npm start
```

De website draait nu op `http://localhost:3000`.

## 3. Cloud-link maken (om te delen)

Open een **nieuw** PowerShell-venster en voer uit:

```powershell
cd D:\AhmadAlDibo-WORKSPACE\Real-Work\GPS-tracking-system
npx --yes cloudflared tunnel --url http://127.0.0.1:3000
```

Na ~15 seconden verschijnt er een regel zoals:

```
https://some-random-words.trycloudflare.com
```

**Die link kun je nu delen.** Iedereen met internet kan de site openen.

> **Belangrijk:** deze link verandert elke keer als je cloudflared opnieuw start. De tunnel moet blijven draaien (laat het venster open).

## 4. Inloggen

Er is één admin-account (publieke registratie is uitgeschakeld):

| Rol | E-mail | Wachtwoord |
| --- | --- | --- |
| Admin | `admin@gps.local` | `Admin123!` |

Wachtwoord resetten:

```powershell
npm run admin:reset-password -- NieuwWachtwoord123!
```

## 5. Android-app koppelen

1. Open het **dashboard** → tab **API Keys**
2. Klik **+ Nieuwe key** → kopieer de key (wordt maar 1× getoond)
3. Open de **Location Agent** app op je telefoon
4. Tab **API's** → API bewerken
5. Plak de **API-key** en zet de URL naar:
   ```
   https://JOUW-CLOUD-LINK.trycloudflare.com/api/ingest
   ```
6. Tab **Status** → **START delen**

## 6. Dashboard openen

Open de cloud-link in je browser → log in → je ziet de kaart met live voertuigen.

---

## 7. Periodieke deadline-job (background taak)

De deadline-controle (taken met overschreden vervaldatum → status "Te laat" +
in-app melding) draait **2× per dag** (09:00/21:00, tijdzone uit Instellingen).

**Eén keer uitvoeren** (voor cron/Task Scheduler):

```powershell
npm run jobs:once
```

**Als daemon** (elke 60 seconden controleren op openstaande slots):

```powershell
npm run jobs
```

De job is idempotent: gemiste slots worden ingehaald, dubbele worden
overgeslagen (unieke `slotKey` in `job_runs`). Uitvoeringen, resultaten en
fouten staan in de tabel `job_runs`.

Voorbeeld Windows Task Scheduler (elke dag 09:00 + 21:00):

```powershell
schtasks /create /tn "GPS-DeadlineJob" /tr "npm run jobs:once" /sc daily /st 09:00
schtasks /create /tn "GPS-DeadlineJob-21" /tr "npm run jobs:once" /sc daily /st 21:00
```

---

## Tests draaien

```powershell
# API smoke-test (server moet draaien)
npm run test:e2e

# Soft delete / prullenbak / herstellen / definitief verwijderen (server moet draaien)
npm run test:trash

# Deadline-job: statussen, meldingen, idempotentie, catch-up (geen server nodig)
npm run test:jobs

# Locaties, routes, import, geocode-proxy (parser-checks lokaal; API-checks server)
npm run test:locations

# Kaartpagina-smoke in echte browser (Playwright; server moet draaien)
npm run test:map

# GPS-pijplijn: dedupe/edge-tests tegen /api/ingest/teltonika (server + .env)
node scripts/test-dedupe.mjs
node scripts/test-ingest-edge.mjs

# Teltonika TCP-selftest: start eerst de AVL-server los
node teltonika/server.mjs        # venster 2
node teltonika/selftest.mjs      # verwacht ACK 14 op de echte FMC920-chunk
```

Andere kwaliteitscontroles:

```powershell
npm run typecheck
npm run lint
npm run build
```

---

## Alles stoppen

Sluit de PowerShell-vensters van `npm start`, `npm run jobs` (indien actief) en `cloudflared`.
Stop de database: `net stop postgresql-x64-18`
