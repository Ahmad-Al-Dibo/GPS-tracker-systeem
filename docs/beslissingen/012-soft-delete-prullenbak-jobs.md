# Beslissing 012 — Soft delete, prullenbak, deadline-job en rapporten-upgrade

**Datum:** 2026-10-18
**Status:** vastgelegd

## Context

Verwijderen van personen/voertuigen gebeurde fysiek (hard delete): alle
gerelateerde data (GPS-punten, koppelingen, events) verdween direct. Dat is
niet professioneel — per ongeluk verwijderde records zijn onherstelbaar.
Daarnaast ontbrak een geplande controle op overschreden taken-deadlines, en
was het rapportensysteem beperkt tot drie CSV-bestanden zonder voorbeeld.

## Keuzes

### 1. Soft delete + prullenbak

- `Person` en `IngestSource` (voertuigen) hebben nu `deleted_at` + `deleted_by`
  (FK naar `users`, `ON DELETE SET NULL`) + index op `deleted_at`.
- `DELETE /api/persons/[id]` en `DELETE /api/vehicles/[id]` = **soft delete**:
  record blijft in de DB, `deletedAt/deletedBy` worden gezet, audit-logregel.
- **Koppelingen blijven bewaard** bij soft delete → herstel zet de relaties
  terug zonder opnieuw te koppelen.
- Alle actieve lijsten/API-responses filteren op `deletedAt: null` (personen,
  voertuigen, trackers, overview, events, ingest-sources, rapporten,
  kaart-/historie-selecties). Koppelen aan een verwijderd record → 409.
- `GET /api/trash?type=persons|vehicles` — prullenbak-lijst, gesorteerd op
  verwijderdatum (nieuwste eerst), met verwijderdoor en afhankelijkheid-tellingen.
- `POST /api/{persons|vehicles}/[id]/restore` — herstel; wist alleen
  `deletedAt/deletedBy`. **`isActive` (tracker-actief) en gebruikersrechten
  worden nooit aangeraakt** door verwijderen/herstellen.
- `DELETE …?permanent=true` — definitief verwijderen: **admin-only**, alleen
  uit de prullenbak, **altijd `confirm=true` vereist** (409 +
  `code: needs_confirmation` met tellingen van afhankelijkheden).
- Naam-uniekheid voertuigen: het DB-unieke `name` blijft gelden, ook in de
  prullenbak. Nieuw voertuig metzelfde naam → 409 met melding "naam staat in
  de prullenbak". Herstel kan daarom nooit op een naam-conflict stuiten.
- Ingest blijft GPS-punten schrijven op een verwijderd record (upsert op naam)
  → geschiedenis loopt door; regel-events/meldingen worden voor verwijderde
  voertuigen overgeslagen.

### 2. Periodieke deadline-job

- Nieuwe tabel `job_runs` (`job_name`, uniek `slot_key`, status
  running/success/failed, duur, result-JSON, fout) — uitvoeringslog.
- Job `deadline-check`, gepland **2× per dag (09:00/21:00)** in de
  tijdzone uit Instellingen (`Europe/Amsterdam` standaard); override via env
  `DEADLINE_SCHEDULE="09:00,21:00"`.
- Logica (idempotent):
  1. Overdue-taken met (weer) toekomstige/geen deadline → terug naar `open`.
  2. `open`/`in_progress` met overschreden deadline → status **`overdue`**
     (nieuwe enum-waarde; alleen noodzakelijke statussen).
  3. Eén in-app melding per overdue taak (toewijzer, anders maker) +
     `overdue_notified_at`-marker → herhaalde runs melden niet opnieuw.
- Runner verwerkt alle vervallen slots t/m nu (lookback 7 dagen): **gemiste
  controles worden ingehaald**, reeds verwerkte slots overgeslagen (unieke
  `slot_key` → ook concurrency-veilig).
- Uitvoering: `npm run jobs:once` (cron/Task Scheduler) of `npm run jobs`
  (daemon, elke 60s). Logregels + `job_runs`-rijen per uitvoering.
- Taak-PATCH: status terug naar `open/in_progress` uit `overdue` reset de
  meldingsmarker (erkenning → opnieuw melden bij nieuwe overschrijding);
  deadline verplaatst naar toekomst herstelt `overdue` direct naar `open`.

### 3. Rapportensysteem professioneel

- Vijf rapporttypes: regel-overtredingen, voertuigactiviteit,
  tracker-beschikbaarheid, **kilometerstanden** (nieuw) en **takenoverzicht**
  (nieuw, met te-laat-indicatie).
- `?format=json` geeft preview-data (kolommen, totalen, eerste 200 rijen) voor
  de UI; `format=csv` (standaard) downloadt met BOM + nette quote/semicolon-escaping.
- UI: datum-presets (vandaag/7d/30d/maand/alle), rapportkaarten, statistiekbalk
  (regels, periode, gegenereerd) en voorbeeldtabel vóór download.

### 4. Overige fixes

- Encoding-bugs (mojibake `â€”`/`â€¦`/emoji) in 6 pagina's → correcte tekens.
- Geofences-kaart: CARTO-tiles (API-CDN) vervangen door **OpenStreetMap**
  (geen externe key/dienst) — kaart was leeg in bepaalde netwerken.
- Eén administratieaccount; verwijder-informatie in `opstarten.md` gecorrigeerd.
- ESLint: strikte React-Compiler-regels `react-hooks/set-state-in-effect` en
  `react-hooks/purity` uitgezet (conform bestaande fetch-in-effect-conventie);
  lint is nu foutvrij (0 errors).

## Migratie

`20261018114602_soft_delete_trash_jobs` (additief, bestaande data behouden):
enum-value `overdue`, kolommen `deleted_at`/`deleted_by`/`overdue_notified_at`,
tabel `job_runs`, indexen op `deleted_at` en `(status, due_date)`.

## Gevolgen / bekend gedrag

- Definitief verwijderen van een voertuig verwijdert wél GPS-punten en events
  (DB-cascade); dat gebeurt **alleen** met admin + expliciete bevestiging waarbij
  de aantallen getoond worden. Taken behouden hun record (voertuigkoppeling → NULL).
- Personen zijn geen gebruikersaccounts: verwijderen raakt logins niet.
- Terwijl een voertuig in de prullenbak staat, loopt de GPS-ingest door op het
  verborgen record (geen phantom-voertuigen; geschiedenis compleet bij herstel).
- `npm run jobs`/`jobs:once` moeten naast de website draaien (apart proces).

## Tests

- `npm run test:trash` — 72 checks (verwijderen, filteren, prullenbak,
  herstellen, definitief verwijderen, autorisatie, GPS-geschiedenis, accounts).
- `npm run test:jobs` — 28 checks (statussen, meldingen, idempotentie bij
  herhaalde uitvoering, catch-up van gemiste slots, JobRun-logging).
- `npm run test:e2e` — 11 bestaande smoke-checks.
