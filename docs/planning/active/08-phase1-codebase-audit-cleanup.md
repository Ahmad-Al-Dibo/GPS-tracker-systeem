# Plan 08 — Phase 1: Codebase-audit, cleanup & architectuur-refactor

**Status:** afgerond (2026-11-14)
**Prioriteit:** HOOG — productie-readiness vóór domein-activatie
**Datum:** 2026-11-14

## Doel

Bestaande codebase begrijpen, opruimen en verbeteren vóór nieuwe features.
**Geen rewrite.** Bestaande GPS-pijplijn behouden. Geen nieuwe functionaliteit.

## Vastgestelde architectuur (geverifieerd)

```text
Teltonika FMC920 → TCP-tunnel (bore/Pinggy/nginx-stream:5556)
  → teltonika/server.mjs (Node, AVL codec 8/8E decode, CRC-16/IBM)
  → POST /api/ingest/teltonika (X-Ingest-Key)
  → GpsDevice / IngestSource / IngestPoint (PostgreSQL)
  → frontend polling (5–10s) → TrackingMap
```

- **Python-listener (`src/PYTHON-listener/`) is GEEN productiepad** — post naar
  `/api/gps` (alleen memory, geen DB-write, 401 in productie). Behouden als
  dev-only, documenteren als experimenteel.
- `teltonika/` is de echte ontvanger; wordt vastgelegd in git (zie commit-stappen).

## Baseline (vóór wijzigingen)

- `npm run typecheck` ✅ · `npm run lint` ✅
- Testscripts: `test:e2e` (11), `test:trash` (72), `test-jobs` (28), `test:locations` (59)
- `npm run build` — nog niet gedraaid in audit; wordt eerste actie.

## Gevonden problemen (samengevat)

### Security (geconfirm bug)
1. **IDOR:** `events/[id]` PATCH mist ownership-check die GET wel heeft — elke
   ingelogde gebruiker mag elk event wijzigen.
2. **Geen rate-limit/lockout/failure-logging** op `/api/auth/login`.
3. **Open redirect:** `login/page.tsx` vertrouwt `?callbackUrl=` zonder
   same-origin validatie.
4. **Hardcoded ingest-key** in `teltonika/start-web-mode.cmd:3` (gelijk aan
   `.env`-waarde) + timing-unsafe vergelijking in `ingest/teltonika/route.ts`.
5. Proxy-matcher is allowlist-stijl → toekomstige routes zijn standaard publiek.
6. Geen security headers in `next.config.ts`; error-messages lekken internals
   (`health/*`, `geocode`, `(fleet)/error.tsx`).

### Kaart- & UI-duplicatie
1. `polygon-editor.tsx` heeft eigen `MapContainer` (geen search/locate/fullscreen);
   tile-config dupliceert `tracking-map.tsx`.
2. Data-shaping 6× gedupliceerd: `mapVehicles` (3×), geofence-fetch+`JSON.parse`
   (3×), locations-mapping (2×), `Source`-type (3×, uiteenlopend).
3. UI-patronen: 12× error-banner, 10× `save()`-patroon, 9× table-head,
   21× input-class, 16× native `confirm()`, 5× `dynamic()`-boilerplate,
   6× redundante `/api/me`-fetches. Geen gedeelde primitives.
4. Locate- en fullscreen-knop staan op dezelfde positie
   (`tracking-map.tsx:636` vs `:811`) — mobiel locate-klikbaar geblokkeerd.

### Bugs (geconfirm)
- Stale trail-`limit` (`history/page.tsx:119`), stale-trail-race zonder
  sequence-guard (`map/page.tsx:259`), dode "Opslaan als locatie"-knoppen,
  locations-filter-twee-takken-identiek (`locations/page.tsx:830`),
  onguardde `JSON.parse(z.coordinates)` ×3, `watchPosition` double-start lek,
  stille mutation-fouten (geen `res.ok`) ×8, `useSearchParams` zonder Suspense,
  `PolygonEditor` negeert `initialCoords`-updates, fullscreen-statedesync,
  onbehandelde `void load()`-rejecties, `settings` mojibake `" Â·"`.

### GPS-pijplijn-risico's
- **ACK-0 retry-storm:** apparaat zonder vehicle-link → `accepted:0` →
  device herstuurt frame oneindig.
- **Corrupt selftest-fixture:** hex in `selftest.mjs` is 2409 tekens (oneven) —
  1 hex-digit mist; plan-04 "CRITICAL parse-bug" is waarschijnlijk
  fixture-artefact (herstelde frame parse't alle 14 records exact).
- Race op `lastRecordCount` (niet-atomair); idempotency-lookup buiten try;
  notifications niet gekoeld (spam per ingest-tick); negatieve timeGap in
  `distance.ts` niet afgevangen; `IngestPoint.receivedAt` mist index
  (retention = table scan).

### Hygiene
- `validation-ingest.ts` = dode duplicaat van `validation.ts`.
- Lege `src/types/`, `src/app/api/auth/register/`.
- `@types/bcryptjs` in runtime dependencies (onnodig).
- `*.err` niet in `.gitignore`.
- **81 uncommitted bestanden** incl. hele `teltonika/`, `deploy/`,
  `DEPLOYMENT.md`, ingest-route, health-routes en 3 Prisma-migraties.

## Werkplan (7 stappen, commit na elke groene stap)

### Stap 1 — Safety net & repo-hygiëne
- [x] Baseline: `typecheck`, `lint`, `build`, `test:jobs`; server + `test:e2e`,
      `test:trash`, `test:locations` — uitkomst vastleggen.
- [x] `.gitignore`: `*.err` toevoegen.
- [x] Verwijderen: `src/lib/validation-ingest.ts`, `src/types/`,
      `src/app/api/auth/register/`.
- [x] `@types/bcryptjs` uit `dependencies`.
- [x] Commit 1.

### Stap 2 — Security-fixes
- [x] IDOR-fix `events/[id]` PATCH (ownership-check + Zod voor
      `assignedUserId`/`reviewNotes`).
- [x] Open-redirect fix in `login/page.tsx` (alleen relatieve paden).
- [x] Login rate-limit (5/15min per IP+identifier → 429) + failure-logging
      (`logger` + `logAudit`), geen nieuwe dependency.
- [x] Hardcoded key weg uit `start-web-mode.cmd`; `timingSafeEqual` over
      SHA-256-digests in ingest-route; key-rotatie voorbereiden (device-stap
      = gebruiker).
- [x] Proxy-matcher omkeren naar default-deny `/api/:path*` met publieke
      allowlist (`/api/auth/*`, `/api/health*`, `/api/ingest`,
      `/api/ingest/teltonika`); `/api/gps` uit publieke lijst.
- [x] Security headers in `next.config.ts` (nosniff, XFO, Referrer-Policy,
      Permissions-Policy, HSTS prod, `poweredByHeader:false`); CSP = follow-up.
- [x] Geen internals lekken: generieke messages in `health/*`, `geocode`,
      `(fleet)/error.tsx`.
- [x] Alle 3 de auth-gerelateerde tests draaien. Commit 2.

### Stap 3 — Gedeelde kaart & data-shaping (kern-refactor)
- [x] `src/lib/map-data.ts`: `toMapVehicles()`, `parseGeofences()` (veilige
      per-row JSON.parse), `toMapLocations()`, gedeeld `Source`-type.
- [x] `src/lib/use-map-data.ts` ("use client"): `useFleetSources()`,
      `useGeofences()`, `useLocations()` — 1× fetch+poll+error+AbortController.
- [x] `tracking-map.tsx`: locate/fullscreen-overlap fix (stack), fullscreen
      statedesync, `MapController` dep-fix, dode code weg, dode
      save-actions verbergen, `alert()` → inline error.
- [x] `polygon-editor.tsx`: gedeelde tile-config, reageer op
      `initialCoords`-updates, `onChange` uit state-updater.
- [x] Pagina's migreren (dashboard, map, history, locations) → hooks;
      page-bugs fixen (stale limit, trail-race, `:830` ternary,
      Suspense voor `useSearchParams`, geofence-delete `res.ok`).
- [x] `CODEBASE_GUIDE.md` bijwerken. Typecheck/lint/build + handmatige
      kaarttest. Commit 3.

### Stap 4 — Gedeelde UI-primitives
- [x] `src/components/ui/`: `ErrorBanner` (12×), table-head-constanten (9×),
      `fieldClass` inputs (21×), `ConfirmDialog`/`useConfirm` (16×),
      save-form-helper (10×), `formatDateTime()` (nl-NL, consistent).
- [x] Geen volledige component-library/form-framework. Commit 4.

### Stap 5 — GPS-pijplijn-hardening (gedrag behouden)
- [x] ACK-0 retry-storm: records tellen als accepted-but-unstored +
      `logger.warn` wanneer device geldig maar niet gekoppeld.
- [x] `selftest.mjs`-fixture herstellen (1 hex-digit); selftest → ACK 14;
      plan-04 bijwerken met fixture-artefact-conclusie ("live capture
      nodig").
- [x] `lastRecordCount` → Prisma `increment`; idempotency-lookup in try.
- [x] Notifications-cooldown gelijk aan event-cooldown (5 min).
- [x] Negatieve timeGap-afvang in `distance.ts`.
- [x] Migratie: `@@index([receivedAt])` op `IngestPoint` (additief).
- [x] Python-listener README-banner "experimental — not production";
      `console.log` payload-lek in `/api/gps` weg. Commit 5.

### Stap 6 — Loading/error-consistentie
- [x] `try/catch` + error-state voor pagina's zonder (dashboard, map,
      history, geofences, vehicles, persons, alerts, trackers, devices).
- [x] Eén gedeelde `(fleet)/loading.tsx`.
- [x] Low-bugs: apikeys/settings setTimeout-cleanup, settings mojibake,
      `searchAddress` sequence-guard. Commit 6.

### Stap 7 — Eindverificatie & rapport
- [x] Volledige gate: typecheck → lint → build → `npm start` → `test:e2e`,
      `test:trash`, `test:jobs`, `test:locations`.
- [x] Handmatige smoke: login, dashboard, map (search/locate/fullscreen/
      filters/delen), history-trail, geofence tekenen, locations tabs,
      reports CSV, trash restore.
- [x] `CODEBASE_GUIDE.md` + `opstarten.md` bijwerken.
- [x] Definitief rapport (wat inspectie, gefikste bugs, overgebleven
      risico's, wat hardware-verificatie nodig heeft). Commit 7.

## Uitvoeringsnoties (afwijkingen t.o.v. plan)

- **Stap 3:** hooks heten `useIngestSources`/`useVehicleList`/`useMapLayers`
  (plan noemde `useFleetSources`/`useGeofences`/`useLocations`); tile-config
  zit in `src/lib/map-tiles.ts` i.p.v. in tracking-map.
- **Stap 4:** `ConfirmDialog`/`useConfirm` **niet** geïmplementeerd — native
  `confirm()` bewust behouden (eenregelige, toegankelijke browser-API; eigen
  modal = meer code zonder functionele winst). `fieldClass`/`thClass` zijn
  beschikbaar voor nieuw werk, maar bestaande input-class-varianten zijn
  geforceerd gelijk getrokken (verschillende prefixen/kleuren → visuele churn).
  `ErrorBanner` (12→1) en `formatDateTime` wél overal gemigreerd.
- **Stap 5:** notifications-cooldown **niet** gewijzigd — de audit-bevinding
  was onjuist: notificaties worden alleen bij áánmaak van een nieuw event
  verstuurd (cooldown-pad keert vroegtijdig terug), niet per ingest-tick.
  Lokale `TELTONIKA_INGEST_KEY` wél geroteerd (`.env` + `set-key.local.cmd`;
  productie gebruikt al `openssl rand`-keys).
- **Commits:** naast de 7 stappen is er een extra commit met de daarvoor
  ongecommitte productie-code (multi-tenancy-filters, device-registry +
  migraties, health/gps/devices-API's, deploy-assets) — noodzakelijk zodat
  een fresh clone de GPS-pijplijn kan bouwen.

## Buiten scope (aanbevelingen in rapport)

- Python-listener aan productie koppelen; SSE/WebSocket i.p.v. polling;
  `TrackingMap` hernoemen naar `MapView`; volledige component-library;
  CI-pipeline; volledige CSP; nginx `limit_req`; codec-16; live FMC920
  e2e-bewijs (hardware nodig); `apiRequest`-adoptie in overige save-functies
  (tasks/rules/trash/locations).

## Acceptatie

- Alle 4 testscripts groen na elke security-/pipeline-stap.
- `typecheck`, `lint`, `build` groen bij elke commit.
- Kaart-feature-pariteit: search, locate, zoom, fullscreen, navigatie,
  filters werken op dashboard + map + history + locations; geofences
  tekent correct met gedeelde tile-config.
- GPS-pijplijn ongewijzigd in gedrag (ACK-volgorde push-before-ACK behouden);
  selftest ACK 14 na fixture-herstel.
- Geen secrets in git; hardcoded key verwijderd; proxy default-deny.
