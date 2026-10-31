# CODEBASE_GUIDE — Routing- en architectuurgids

Praktische navigatiegids voor developers en AI-agents. Alle paden, symbolen en
relaties zijn geverifieerd tegen de broncode (laatste controle: 2026-10-18).

## Inhoudsopgave

- [A. Projectoverzicht](#a-projectoverzicht)
- [B. Repositorystructuur](#b-repositorystructuur)
- [C. Bestands- en modulereferentie](#c-bestands--en-modulereferentie)
- [D. Feature-routing-index](#d-feature-routing-index)
- [E. Class- en function-index](#e-class--en-function-index)
- [F. Architectuur en dataflow](#f-architectuur-en-dataflow)
- [G. Hoe voeg je een nieuwe feature toe](#g-hoe-voeg-je-een-nieuwe-feature-toe)
- [H. Regels en conventies](#h-regels-en-conventies)
- [I. Testen en verificatie](#i-testen-en-verificatie)
- [J. Veelvoorkomende wijzigingsscenario's](#j-veelvoorkomende-wijzigingsscenario)
- [K. Beperkingen en risicogebieden](#k-beperkingen-en-risicogebieden)
- [L. Onderhoud van deze gids](#l-onderhoud-van-deze-gids)

---

## A. Projectoverzicht

**Wat het doet:** GPS-vlootbeheerplatform — voertuigen/personen/trackers beheren,
live kaart met GPS-posities (ingest via API-keys van Android-app of browser),
regel-engine met events/meldingen, taken met deadlines, geofences, rapportages,
prullenbak (soft delete) en geplande background-jobs.

**Stack:** Next.js 16.4 (App Router, Turbopack) · React 19 · TypeScript (strict)
· PostgreSQL 18 + Prisma 6.19 · Zod 4 · Leaflet/react-leaflet 5 · Tailwind 4 ·
bcryptjs · tsx (scripts)

**Entry points:**

| Entry | Pad | Rol |
|---|---|---|
| Web-app (App Router) | `src/app/` | Pagina's + API-routes |
| Route-guard (Next 16 "proxy") | `src/proxy.ts` | Middleware: sessie-controle op gematchte routes |
| Ingest (extern) | `POST /api/ingest` | GPS-punten van apparaten (API-key auth) |
| Background jobs | `scripts/jobs.ts` | Deadline-check daemon/once |
| Seed | `prisma/seed.ts` | Admin-account aanmaken |

**Belangrijkste dataflows:**

1. **Live tracking:** Android-app/browser → `POST /api/ingest` (X-API-Key) →
   upsert `IngestSource` per naam → `IngestPoint` → afstandsberekening →
   regel-evaluatie (fire-and-forget) → `Event` + `Notification` (+ optioneel `Task`).
2. **Beheer (UI):** pagina (`src/app/app/(fleet)/*`) → `fetch("/api/…")` →
   route-handler met `requireAuth`/`requireAdmin` → Prisma → JSON.
3. **Deadline-job:** `scripts/jobs.ts` → `runDueJobs()` → slots uit
   `getDueSlots()` → `runDeadlineCheck()` → status `overdue` + meldingen →
   log in `job_runs`.

**Configuratie:** `.env` (namen: `DATABASE_URL`, `ADMIN_EMAIL`,
`ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ADMIN_BUILD_API_KEY`,
`NEXT_PUBLIC_CARTO_KEY`, `AUTH_SECRET`, `AUTH_TRUST_HOST` — de laatste twee
worden **niet in de code gebruikt**; `DATABASE_URL` is verplicht).
Instellingen van de app zelf: tabel `settings` (orgKey `default`), via
`/api/settings`. Constants: `src/lib/config.ts`.

---

## B. Repositorystructuur

```text
GPS-tracking-system/
├── src/
│   ├── proxy.ts                 # Route-guard (Next 16 middleware-proxy)
│   ├── app/
│   │   ├── layout.tsx           # Root layout (importeert leaflet.css + globals.css)
│   │   ├── globals.css          # Design-tokens, Tailwind, Leaflet z-index-fix
│   │   ├── page.tsx             # Publieke startpagina → redirect/login
│   │   ├── login/page.tsx       # Inlogpagina
│   │   ├── api/                 # REST-endpoints (App Router route.ts)
│   │   │   ├── auth/{login,logout}/
│   │   │   ├── ingest/          # Publiek met API-key (apparaten)
│   │   │   ├── keys/, me/, overview/, notifications/, reports/,
│   │   │   ├── persons/, vehicles/, trackers/, vehicle-persons/,
│   │   │   ├── events/, rules/, geofences/, tasks/, settings/,
│   │   │   ├── trash/, users/
│   │   └── app/(fleet)/         # Ingelogde UI (route-group "fleet")
│   │       ├── layout.tsx       # Sidebar + mobile nav (NAV_ITEMS)
│   │       ├── page.tsx         # Dashboard
│   │       └── {map,history,persons,vehicles,vehicles/[id],trackers,
│   │            rules,alerts,geofences,tasks,reports,apikeys,
│   │            settings,trash}/page.tsx
│   ├── components/              # Gedeelde client-components
│   │   ├── tracking-map.tsx     # Kaart (zoekblocs, locate, markers, fullscreen)
│   │   └── polygon-editor.tsx   # Geofence-tekenaar
│   ├── lib/                     # Server-/businesslogic
│   │   ├── db.ts                # Prisma-singleton
│   │   ├── auth-session.ts      # DB-sessies + cookie
│   │   ├── api-helpers.ts       # requireAuth / requireAdmin / jsonError
│   │   ├── api-keys.ts          # API-key genereren/hash/valideren
│   │   ├── validation.ts        # Zod-schemas (login, keys, ingest, source)
│   │   ├── validation-ingest.ts # Duplicaat-variant (zie Constraints!)
│   │   ├── audit.ts             # logAudit()
│   │   ├── distance.ts          # Haversine + delta-berekening
│   │   ├── config.ts            # Constants (OFFLINE_AFTER_MS, …)
│   │   ├── presence.ts          # computeWorkerStatus() — GEEN aanroepr (legacy)
│   │   ├── rules/
│   │   │   ├── engine.ts        # Regel-evaluatie (condities, planning, geofence)
│   │   │   └── events.ts        # Event-detectie + bewijs + notificaties
│   │   └── jobs/
│   │       ├── schedule.ts      # Slots 09:00/21:00, tijdzone, lookback
│   │       ├── deadline-check.ts# Kernlogica deadline-controle
│   │       └── runner.ts        # JobRun-logging + idempotente uitvoering
│   └── types/                   # LEEG (overblijfsel — niet gebruikt)
├── prisma/
│   ├── schema.prisma            # Hele datamodel (bron van waarheid)
│   ├── seed.ts                  # Admin-account via env-variabelen
│   └── migrations/              # SQL-migraties (additief)
├── scripts/
│   ├── jobs.ts                  # Job-daemon/`--once`
│   ├── e2e-api.mts              # 11 API smoke-checks (server nodig)
│   ├── test-trash.mts           # 72 checks soft delete/prullenbak (server nodig)
│   ├── test-jobs.mts            # 28 checks deadline-job (geen server)
│   └── reset-password.ts        # Admin-wachtwoord resetten
├── docs/
│   ├── beslissingen/            # Architectuur-beslissingen 001–013 + index
│   ├── planning/                # MVP-plannen
│   └── presentatie.html
├── android-location-agent/      # Kotlin-companion app (aparte build)
├── opstarten.md                 # Operationele handleiding (server/tunnel/jobs/tests)
├── package.json                 # Scripts (zie sectie I)
├── eslint.config.mjs            # Lint-config (2 react-hooks-regels uit)
├── tsconfig.json                # strict; pad @/* → src/*
└── next.config.ts               # Turbopack + Tailwind-loader
```

**Wat hoort waar:**

- `src/app/api/**/route.ts` — één route-handler per HTTP-methode; bevat
  validatie + autorisatie + aanroep naar Prisma. Geen aparte "service"-laag.
- `src/lib/` — herbruikbare serverlogica (auth, regels, jobs, afstand). Mag
  **niet** `next/headers` aanroepen behalve `auth-session.ts`.
- `src/components/` — client-components (`"use client"`), herbruikbaar over pagina's.
- `src/app/app/(fleet)/` — uitsluitend pagina's; geen businesslogica, alleen
  `fetch` + presentatie.
- `prisma/` — schema + migraties + seed. Wijzigingen altijd via
  `prisma migrate dev` (nooit handmatig in DB).
- `scripts/` — uitvoerbare tsx-scripts (jobs, tests). Gebruik `.mts` bij
  top-level await.

---

## C. Bestands- en modulereferentie

### Kernbestanden

| Bestand | Verantwoordelijkheid | Belangrijke symbolen | Wijzigen bij |
|---|---|---|---|
| [prisma/schema.prisma](prisma/schema.prisma) | Volledig datamodel | `User`, `Session`, `ApiKey`, `IngestSource`, `IngestPoint`, `Person`, `VehiclePerson`, `Rule`, `RuleCondition`, `Event`, `EventPoint`, `Geofence`, `Task`, `Notification`, `Settings`, `AuditLog`, `JobRun`; enums `Role`, `EventStatus`, `Severity`, `TaskStatus` (incl. `overdue`), `JobRunStatus` | Nieuwe velden/relaties → daarna `prisma migrate dev` |
| [src/proxy.ts](src/proxy.ts) | Route-guard vóór elke gematchte request | `proxy()`, `config.matcher` | Nieuwe protected routes toevoegen aan matcher; publieke routes eruit laten |
| [src/lib/auth-session.ts](src/lib/auth-session.ts) | DB-sessies in httpOnly-cookie `gps_session_id` (TTL 12u, één sessie per gebruiker) | `SESSION_COOKIE`, `createSession()`, `revokeSession()`, `getAuth()`, `AuthContext` | Auth-mechaniek (cookie-naam, TTL) |
| [src/lib/api-helpers.ts](src/lib/api-helpers.ts) | Autorisatie-guards voor route-handlers | `requireAuth()`, `requireAdmin()`, `jsonError()` | Nieuwe rollen/statussen |
| [src/lib/api-keys.ts](src/lib/api-keys.ts) | API-keys: `gpta_` + 48 hex; opslaan als SHA-256 | `generateApiKey()`, `validateApiKey()`, `sha256()`, `API_KEY_PREFIX` | Key-formaat/hashing |
| [src/lib/db.ts](src/lib/db.ts) | PrismaClient-singleton (hotreload-veilig) | `prisma` | Alleen bij Prisma-upgrades |
| [src/lib/validation.ts](src/lib/validation.ts) | Zod-schemas voor login/keys/ingest/source-update | `loginSchema`, `apiKeyCreateSchema`, `ingestLocationSchema`, `updateSourceSchema` | Payload-contracten |
| [src/lib/rules/engine.ts](src/lib/rules/engine.ts) | Evalueert regels tegen telemetry | `toSnapshot()`, `loadActiveRules()`, `matchesSchedule()`, `pointInPolygon()`, `evaluateRules()`, types `TelemetrySnapshot`, `RuleEvaluation`, `RuleWithConditions` | Nieuwe conditietypes/operator |
| [src/lib/rules/events.ts](src/lib/rules/events.ts) | Event-detectie met GPS-bewijs + meldingen | `processIngest()`, `addPostEventPoints()`, `processStaleEvents()` (niet aangeroepen — ongewired) | Event/cooldown/beleid |
| [src/lib/geocode.ts](src/lib/geocode.ts) | Server-side geocoding (Photon+Nominatim) + OSRM-straatroute | `geocode()`, `fetchRoadRoute()`, `GeocodeResult`, `RoadRoute` | Provider wisselen, timeouts |
| [src/lib/locations/import.ts](src/lib/locations/import.ts) | Import-parser + normalisatie/dedupe | `parseImportContent()`, `normalizeAddressKey()`, `dedupeKey()`, `parseCsvLine()` | Nieuwe importformaten |
| [src/lib/locations/routes.ts](src/lib/locations/routes.ts) | Routes-API schema + serializer | `routeCreateSchema`, `routePointInputSchema`, `serializeRoute()` | Route-contracten |
| [src/lib/map-filters.ts](src/lib/map-filters.ts) | Gedeelde kaartfilter-state (pagina-scoped) | `useMapFilters()`, `applyLocationFilters()`, `MapFilterState`, `DEFAULT_FILTERS` | Nieuwe lagen/filters |
| [src/components/map-filters.tsx](src/components/map-filters.tsx) | Filterpaneel-overlay op kaarten | default `MapFilterControl` | Filter-UI |
| [src/components/tracking-map.tsx](src/components/tracking-map.tsx) | Kaart-component (OSM-tiles, markers, geofences, locaties, routes, zoekbalk via /api/geocode, locate, fullscreen, legenda) | `TrackingMap` (default), `SearchControl`, `LocateButton`, `MapController`, `vehicleIcon()`, types `MapVehicle`, `MapZone`, `MapLocation`, `RouteVisualization`, `SelectionMarker` | Kaartgedrag/UI/lagen |
| [src/lib/distance.ts](src/lib/distance.ts) | Haversine + stilstand/sprong-detectie | `haversineDistance()`, `calculateDistanceDelta()`, `calculateSpeed()`, `MIN_MOVEMENT_M`, `MAX_GAP_M`, `MAX_TIME_GAP_S` | Afstands-/snelheidsregels |
| [src/lib/audit.ts](src/lib/audit.ts) | Audit-logregels | `logAudit(actorUserId, action, targetType, targetId, detail)` | Nieuwe audit-acties |
| [src/lib/jobs/schedule.ts](src/lib/jobs/schedule.ts) | Planning-slots (2×/dag 09:00/21:00, TZ uit Settings, lookback 7d) | `DEFAULT_DEADLINE_SCHEDULE`, `LOOKBACK_DAYS`, `getDueSlots()`, `zonedToInstant()`, `localDateKey()` | Andere planning |
| [src/lib/jobs/deadline-check.ts](src/lib/jobs/deadline-check.ts) | Kernlogica: overdue-markering + meldingen (idempotent) | `runDeadlineCheck(now)`, `DeadlineCheckResult` | Ander deadline-beleid |
| [src/lib/jobs/runner.ts](src/lib/jobs/runner.ts) | Slot-verwerking + `JobRun`-logging + catch-up | `runDueJobs()`, `JOB_DEADLINE_CHECK`, `RunSummary` | Nieuwe jobs toevoegen |
| [src/components/polygon-editor.tsx](src/components/polygon-editor.tsx) | Geofence-tekenaar | `PolygonEditor` (default), `DrawHandler`, `DrawInfo` | Tekengedrag |
| [src/app/app/(fleet)/layout.tsx](src/app/app/(fleet)/layout.tsx) | Navigatie (sidebar + mobile bottom-nav) | `NAV_ITEMS`, `MOBILE_NAV` | Nieuwe pagina toevoegen aan menu |
| [scripts/jobs.ts](scripts/jobs.ts) | Job-daemon (`npm run jobs`) of één slag (`--once`) | `main()`, `runOnce()` | Interval/CLI |
| [prisma/seed.ts](prisma/seed.ts) | Admin-account + optionele build-key | `main()` (upsert op `ADMIN_EMAIL`) | Seed-beleid |

### API-routes (volledig)

| Route | Methoden | Auth | Opmerking |
|---|---|---|---|
| `/api/auth/login` | POST | publiek | identifier = email óf username; bcrypt; `createSession` |
| `/api/auth/logout` | POST | cookie | `revokeSession` |
| `/api/auth/register` | — | — | **Bestaat niet** (lege map; 404) |
| `/api/me` | GET | sessie | retourneert `AuthUser` |
| `/api/ingest` | POST | **X-API-Key** | upsert `IngestSource` op `name`; maakt `IngestPoint`; afstand; regels (overgeslagen bij soft-deleted bron) |
| `/api/ingest/sources` | GET | sessie | laatste posities; filtert `deletedAt: null`; niet-admin: eigen bronnen |
| `/api/ingest/sources/[name]` | GET/PATCH/DELETE | sessie + eigenaar/admin | DELETE = soft delete |
| `/api/keys` | GET/POST | sessie | raw key 1× in response |
| `/api/keys/[id]` | PATCH/DELETE | sessie | intrekken/activeren |
| `/api/overview` | GET | sessie | dashboard-statistieken (filtert verwijderde voertuigen) |
| `/api/notifications` | GET/POST | sessie | POST marqueert gelezen (`id` of `all: true`) |
| `/api/persons` | GET/POST | sessie | lijst filtert `deletedAt: null` |
| `/api/persons/[id]` | GET/PATCH/DELETE | sessie; purge = admin | DELETE soft; `?permanent=true&confirm=true` = definitief |
| `/api/persons/[id]/restore` | POST | sessie | herstel uit prullenbak |
| `/api/vehicles` | GET/POST | sessie | naam-uniek (ook in prullenbak → 409) |
| `/api/vehicles/[id]` | GET/PATCH/DELETE | sessie; purge = admin | idem soft/purge |
| `/api/vehicles/[id]/restore` | POST | sessie | herstel |
| `/api/trackers` | GET/POST | sessie | IngestSources met tracker-gegevens |
| `/api/vehicle-persons` | POST/DELETE | sessie | koppelen; verwijderde records → 409 |
| `/api/events` | GET | sessie | filters; niet-admin: eigen voertuigen; sluit verwijderde voertuigen uit |
| `/api/events/[id]` | GET/PATCH | sessie + eigenaar/admin | PATCH status/assignee; resolve → post-event punten |
| `/api/rules` | GET/POST | GET sessie; POST **admin** | regels + condities |
| `/api/rules/[id]` | PATCH/DELETE | admin | |
| `/api/geofences` | GET/POST | sessie | polygon als JSON-string |
| `/api/geofences/[id]` | PATCH/DELETE | sessie | |
| `/api/tasks` | GET/POST | sessie | niet-admin: eigen taken (assignee/creator) |
| `/api/tasks/[id]` | PATCH/DELETE | sessie + creator/assignee/admin | status-validatie incl. `overdue`; erkenning reset meldingsmarker |
| `/api/settings` | GET/PATCH | GET sessie; PATCH **admin** | singleton orgKey `default` |
| `/api/users` | GET/PATCH | **admin** | rol/actief; deactiveren trekt sessies in |
| `/api/trash` | GET | sessie | `?type=persons\|vehicles`; gesorteerd op `deletedAt` desc |
| `/api/reports` | GET | sessie | `?type=events\|activity\|availability\|distances\|tasks&from&to&format=csv\|json` (CSV-formule-injectie beveiligd) |
| `/api/geocode` | GET | sessie | Server-proxy: Photon + Nominatim (UA-plicht); 502 bij uitval |
| `/api/locations` | GET/POST | sessie | `?status=active\|expired\|all\|deleted&type&q`; temporary vereist toekomst-vervaldatum |
| `/api/locations/[id]` | GET/PATCH/DELETE | sessie | DELETE = soft delete |
| `/api/locations/[id]/restore` | POST | sessie | herstel |
| `/api/locations/batch` | POST | sessie | batch-create met adres-dedupe (max 200) |
| `/api/locations/import` | POST | sessie | analyse + geocode (max 50/verzoek); schrijft niets |
| `/api/routes` | GET/POST | sessie | routes + geordende punten (transactioneel) |
| `/api/routes/[id]` | GET/PATCH/DELETE | sessie | PATCH vervangt puntenlijst volledig; DELETE soft |
| `/api/routes/[id]/duplicate` | POST | sessie | kopie |
| `/api/routes/road` | POST | sessie | OSRM-straatroute; 503 → client-fallback rechte lijn |

### UI-pagina's

| Pagina | Pad | Functie |
|---|---|---|
| Login | `src/app/login/page.tsx` | identifier + wachtwoord |
| Dashboard | `src/app/app/(fleet)/page.tsx` | stats + TrackingMap + recente events |
| Kaart | `src/app/app/(fleet)/map/page.tsx` | live-kaart + voertuiglijst + **locatie delen** (watchPosition → ingest) |
| Historie | `src/app/app/(fleet)/history/page.tsx` | voertuig kiezen + trail op kaart |
| Personen / Voertuigen / Trackers | `…/persons|vehicles|trackers/page.tsx` | CRUD-lijsten (soft delete) |
| Voertuig-detail | `…/vehicles/[id]/page.tsx` | bewerken, koppelingen, events, taken |
| Regels / Alerts | `…/rules|alerts/page.tsx` | regel-CRUD; event-afhandeling |
| Geofences | `…/geofences/page.tsx` | PolygonEditor (OSM-tiles) |
| Taken | `…/tasks/page.tsx` | taken + status (`overdue` = "Te laat") + vervaldatum |
| Rapporten | `…/reports/page.tsx` | 5 typen, presets, preview-tabel, CSV-download |
| API Keys | `…/apikeys/page.tsx` | key-beheer (raw 1×) |
| Prullenbak | `…/trash/page.tsx` | tabs personen/voertuigen, herstellen/definitief |
| Locaties & Routes | `…/locations/page.tsx` | tabs Locaties/Routes/Import; geocoding, verloop, route-editor, bulk-import |
| Instellingen | `…/settings/page.tsx` | org-instellingen |

---

## D. Feature-routing-index

Wil ik X wijzigen → ga naar:

### Authenticatie / sessies
1. **Implementatie:** `src/lib/auth-session.ts` (aanmaken/verifiëren),
   `src/proxy.ts` (globale guard), `src/lib/api-helpers.ts` (per-route guard).
2. **Invoerpunten:** `POST /api/auth/login`, `POST /api/auth/logout`, cookie
   `gps_session_id`.
3. **Dataflow:** login → bcrypt.compare → `createSession` → cookie → proxy +
   `requireAuth` lezen DB-sessie per request.
4. **Tests:** `scripts/e2e-api.mts` (checks 1, 9–11); `scripts/test-trash.mts`
   (401/403-checks).
5. **Beperkingen:** geen JWT; sessies zijn server-side; **nooit** raw
   wachtwoorden/key opslaan; proxy-matcher is selectief — route-handlers
   moeten alsnog `requireAuth` aanroepen.

### API-key authenticatie (apparaten)
1. `src/lib/api-keys.ts` → `src/app/api/ingest/route.ts`; beheer:
   `src/app/api/keys/route.ts`, `src/app/app/(fleet)/apikeys/page.tsx`.
2. Flow: app stuurt `X-API-Key` → `validateApiKey()` (SHA-256 lookup +
   isActive/revokedAt) → eigen `userId` wordt eigenaar van de bron.
3. Tests: `e2e-api.mts` checks 4–7.
4. **Beperking:** raw key wordt maar 1× geretourneerd; `keyHash` nooit in
   lijst-responses.

### GPS-ingest (live tracking)
1. `POST /api/ingest` → `ingestLocationSchema` (`src/lib/validation.ts`) →
   `prisma.ingestSource.upsert({ where: { name } })` → `ingestPoint.create` →
   `calculateDistanceDelta()` (`src/lib/distance.ts`) → optioneel
   `processIngest()` (alleen als `!source.deletedAt`).
2. Consumptie: `/api/ingest/sources` → dashboard/kaart/historie-pagina's →
   `TrackingMap`.
3. Tests: `e2e-api.mts` check 6; afstand: `test-trash.mts` (punt landt op
   zelfde bron).
4. **Beperking:** upsert op unieke `name`; soft-deleted bronnen blijven
   updaten (bewust — geschiedenis compleet); regel-events overgeslagen voor
   verwijderde bronnen.

### Regels, events, meldingen
1. Engine: `src/lib/rules/engine.ts`; event-creatie: `src/lib/rules/events.ts`;
   API: `/api/rules`, `/api/events`; UI: `rules/page.tsx`, `alerts/page.tsx`.
2. Flow: ingest → `processIngest(source)` → `evaluateRules` (filters:
   vehicleIds/vehicleGroup/planning/condities/geofence) → `handleViolation`
   (cooldown 5 min per regel+voertuig) → `Event` + `EventPoint`-bewijs +
   `Notification` (admins + eigenaar) + optioneel `Task`.
3. Statusovergangen events: `PATCH /api/events/[id]` (`new` →
   `under_review`/`resolved`/`dismissed`; resolve voegt post-event punten toe).
4. **Beperkingen:** engine is puur (geen side-effects buiten
   `handleViolation`); `durationSec`/`consecutive` worden door
   `evaluateCondition` bepaald — uitbreiden = engine.ts wijzigen;
   `processStaleEvents()` is **geëxporteerd maar nergens aangeroepen**.

### Soft delete / prullenbak
1. Kolommen `deletedAt`/`deletedBy` op `Person` + `IngestSource`;
   DELETE-routes zetten alleen deze velden; herstel via `…/restore`;
   definitief via `?permanent=true&confirm=true` (admin, 409 zonder confirm).
2. Lijst-filters: **elke** actieve query moet `deletedAt: null` bevatten —
   zie bestaande filters in persons/vehicles/trackers/overview/events/reports/
   ingest-sources/vehicle-persons (sectie C). `ManagedLocation` en `Route`
   hebben ook `deletedAt` (soft delete binnen hun module).
3. UI: `trash/page.tsx` + `GET /api/trash`; locaties/routes: eigen
   "Verwijderd"-filter + restore op de modulepagina.
4. Tests: `scripts/test-trash.mts` (72 checks), `test-locations.mts`.
5. **Beperking:** voertuignaam blijft uniek in DB (ook in prullenbak) →
   409 bij gelijke naam; definitief verwijderen heeft DB-cascade op
   `IngestPoint`/`Event` — altijd `confirm=true` verplicht.

### Locaties & Routes (locatiebeheer)
1. Model `ManagedLocation`/`Route`/`RoutePoint` (prisma/schema.prisma);
   API: `/api/locations*`, `/api/routes*`; UI:
   `src/app/app/(fleet)/locations/page.tsx` (tabs); parser:
   `src/lib/locations/import.ts`; serializer: `src/lib/locations/routes.ts`.
2. Actief-beleid temporary: backend-query (`expiresAt > now`, exclusief);
   routepunten = snapshots + optionele `locationId`.
3. Tests: `scripts/test-locations.mts` (59 checks).

### Geocoding / straatroutes
1. `src/lib/geocode.ts` (Photon + Nominatim + OSRM) → `/api/geocode`,
   `/api/routes/road`; client: `SearchControl` + import-flow + route-editor.
2. **Beperkingen:** geen `lang=nl` bij Photon; Nominatim vereist User-Agent;
   publieke demo-services — provider-interface staat swaps toe.

### Kaartfilters / lagen
1. `src/lib/map-filters.ts` (state) + `src/components/map-filters.tsx`
   (paneel) + TrackingMap-props (`zones`, `locations`, `routeLine`).
2. Pagina's laden eigen data en filteren met `applyLocationFilters`;
   `available` bepaalt welke filters getoond worden.

### Deadline-job / geplande taken
1. `src/lib/jobs/{schedule,deadline-check,runner}.ts` + `scripts/jobs.ts`;
   tabel `job_runs`; `Task.status` kan `overdue` zijn; marker
   `Task.overdueNotifiedAt`.
2. Uitvoering: `npm run jobs:once` of daemon `npm run jobs` (elke 60s checkt
   openstaande slots).
3. Tests: `scripts/test-jobs.mts` (28 checks incl. herhaalde uitvoering +
   catch-up).
4. **Beperkingen:** slot-idempotentie via unieke `slotKey` — nooit
   `job_runs` handmatig leegmaken in productie; job-logica moet idempotent
   blijven (updateMany + marker); nieuwe jobs = eigen `jobName` + eigen
   checkfunctie, runner uitbreiden.

### Rapportages
1. `src/app/api/reports/route.ts` (bouwt rijen per type; CSV met BOM of JSON);
   UI `reports/page.tsx`.
2. Nieuw type: voeg object toe aan `reports`-map in de route (kolommen +
   `build()`) + kaartje in `REPORT_TYPES` op de pagina.
3. Tests: geen aparte test — handmatig via `?format=json`; uitbreiden =
   checks toevoegen in `test-trash.mts`-stijl.

### Kaart / plaatszoeker / "mijn locatie" / locatie delen
1. Component: `src/components/tracking-map.tsx`
   (`SearchControl` via Photon/OSM zonder API-key; `LocateButton` via
   browser-geolocation); delen: `map/page.tsx` (`watchPosition` → ingest met
   key uit `localStorage["gps_browser_share_key"]`).
2. **Beperking:** tiles zijn OSM (geen API-key); geolocation vereist
   HTTPS; delen maakt tracker `browser-<username>`.

### Geofences
1. API `/api/geofences`; engine-check `pointInPolygon()` in `engine.ts`;
   teken-UI `polygon-editor.tsx` + `geofences/page.tsx`.
2. Coördinaten worden opgeslagen als JSON-string `[[lat,lon],…]`.

### Taken (UI + API)
1. API `/api/tasks`, `/api/tasks/[id]` (status-validatie +
   overdue-erkenning); UI `tasks/page.tsx`.
2. Automatische taken: regels met `createTask` → `handleViolation` in
   `events.ts`.

### Instellingen
1. `Settings`-model (singleton), `/api/settings` (PATCH admin-only,
   whitelist-velden), UI `settings/page.tsx`; gelezen door o.a.
   `jobs/runner.ts` (timezone) en `deadline-check.ts` (notifyInApp).

### Configuratie / secrets
- `.env` alleen server-side; `NEXT_PUBLIC_*` is client-visible. Nooit
  secrets in `src/` of docs. Admin-credentials via seed-env of
  `npm run admin:reset-password`.

---

## E. Class- en function-index

Belangrijkste exports (alleen geverifieerde symbolen; server-side tenzij
anders):

| Symbol | Module | Doel | Aanroepers |
|---|---|---|---|
| `getAuth()` | `lib/auth-session.ts` | Sessie → `AuthContext \| null` | proxy? (nee — proxy leest DB direct), `/api/me`, `requireAuth` |
| `createSession(userId)` | idem | Nieuwe sessie + cookie | login-route |
| `revokeSession(id)` | idem | Sessie verwijderen + cookie | logout-route |
| `requireAuth()` / `requireAdmin()` | `lib/api-helpers.ts` | Guard met `{ auth, res }`-patroon | vrijwel elke route-handler |
| `generateApiKey()` | `lib/api-keys.ts` | `{ raw, hash, prefix }` | `/api/keys` POST |
| `validateApiKey(raw)` | idem | Lookup op hash; update lastUsedAt | `/api/ingest` |
| `logAudit()` | `lib/audit.ts` | Auditregel (fouten worden gevangen) | tasks, users, settings, events, trash/restore, soft delete |
| `calculateDistanceDelta()` | `lib/distance.ts` | Afstand/sprong/stilstand | ingest-route |
| `toSnapshot()` / `evaluateRules()` | `lib/rules/engine.ts` | Telemetry → evaluaties | `processIngest` |
| `pointInPolygon(lat, lon, polygon)` | idem | Ray-casting | `evaluateRules` (geofence) |
| `processIngest(source)` | `lib/rules/events.ts` | Events + meldingen + taken | ingest-route (fire-and-forget) |
| `addPostEventPoints()` | idem | Post-event bewijs | `PATCH /api/events/[id]` |
| `runDeadlineCheck(now)` | `lib/jobs/deadline-check.ts` | Overdue + meldingen | `runDueJobs` |
| `runDueJobs(opts?)` | `lib/jobs/runner.ts` | Alle vervallen slots | `scripts/jobs.ts`, `test-jobs.mts` |
| `getDueSlots()` | `lib/jobs/schedule.ts` | Slots t/m nu (TZ-aware) | `runDueJobs` |
| `TrackingMap` (default) | `components/tracking-map.tsx` | Kaart met overlays | dashboard, map, history (dynamic, ssr:false) |
| `PolygonEditor` (default) | `components/polygon-editor.tsx` | Polygon tekenen | `geofences/page.tsx` |
| `computeWorkerStatus()` | `lib/presence.ts` | Legacy statusbepaling | **geen aanroepr** (MVP v1-relic) |

---

## F. Architectuur en dataflow

```text
Android-app / browser ("Deel mijn locatie")
  → POST /api/ingest (X-API-Key)
  → validateApiKey → ingestLocationSchema
  → IngestSource.upsert(name) → IngestPoint.create
  → calculateDistanceDelta → IngestSource-update (km-standen)
  → processIngest (async, overgeslagen bij soft-deleted)
      → loadActiveRules → evaluateRules (filter + condities + geofence)
      → handleViolation → Event + EventPoint(bewijs) + Notification + Task?
  → JSON { accepted, sourceId }

Gebruiker (browser)
  → /app-pagina (proxy verifieert sessie-cookie tegen DB)
  → fetch("/api/…") (zelfde cookie)
  → route-handler: requireAuth/requireAdmin
  → Zod-validatie → Prisma (PostgreSQL)
  → JSON (ISO-datums) → pagina-state → presentatie

Background job (apart proces)
  → scripts/jobs.ts (--once of daemon)
  → runDueJobs: getDueSlots(09:00/21:00, TZ, lookback 7d)
  → per slot: JobRun-create (uniek slotKey) → runDeadlineCheck(now)
      → Task.status: open/in_progress → overdue; herstel naar open
      → Notification (toewijzer/creator) + overdueNotifiedAt-marker
  → JobRun-update (success/failed + result + duur)
```

**Modulegrenzen:**

- Route-handlers mogen Prisma direct aanroepen (geen repository-laag).
- `lib/*` mag niet `next/navigation` of pagina-imports gebruiken;
  alleen `auth-session.ts` raakt `next/headers`.
- Client-components halen data via `fetch` (geen gedeelde server-state);
  geen state-management-library — lokaal `useState` + polling.
- `processIngest` is de **enige** ingang voor events; nooit direct
  `prisma.event.create` vanuit routes voor regel-overtredingen.

**Foutafhandeling:** Zod → 400 met `details`; ontbrekende sessie → 401;
geen toegang → 403; niet gevonden → 404; conflicten (naam/uniek) → 409;
audit-fouten worden gevangen en gelogd (`audit.ts`); regel-evaluatie faalt
niet-cripplend (`.catch` in ingest).

---

## G. Hoe voeg je een nieuwe feature toe

### G1. Nieuwe API-endpoint

1. Maak `src/app/api/<naam>/route.ts` (of `[id]/route.ts`).
2. Begin elke handler met `const { auth, res } = await requireAuth();` (of
   `requireAdmin` voor admin-only); `if (res) return res;`.
3. Valideer input met Zod (`safeParse` → 400 + `details`).
4. Roep Prisma aan; filter soft-deleted records waar relevant
   (`deletedAt: null`).
5. Serialize datums expliciet (`.toISOString()`).
6. Voeg toe aan `config.matcher` in `src/proxy.ts` **of** vertrouw op
   `requireAuth` (aanbevolen: altijd requireAuth, matcher optioneel).
7. Log gevoelige acties met `logAudit()`.
8. Tests: uitbreiding in `scripts/test-trash.mts`-stijl (HTTP + prisma) of
   nieuwe `scripts/test-*.mts` + npm-script in `package.json`.

### G2. Nieuwe pagina

1. `src/app/app/(fleet)/<naam>/page.tsx` met `"use client"`.
2. Voeg `{ href, label, icon }` toe aan `NAV_ITEMS` in
   `src/app/app/(fleet)/layout.tsx` (bepaalt ook mobiele zichtbaarheid —
   `MOBILE_NAV = NAV_ITEMS.slice(0, 4)`).
3. Gebruik bestaande design-tokens (zie `globals.css`) en het
   table/formulier-patroon van `persons/page.tsx`.
4. Vergeet mojibake-vrije UTF-8-tekens niet (`…`, `—`).

### G3. Databaseveld / model

1. Wijzig `prisma/schema.prisma` met `@map`-conventies (snake_case kolommen).
2. `npx prisma migrate dev --name korte_beschrijving` (additief, bestaande
   data behouden).
3. Pas API-serialisatie + Zod-schemas + (indien nodig) UI aan.
4. Nieuwe index toevoegen op filter-/sorteervelden (`@@index`).
5. Draai `npm run typecheck && npm run build` + tests.

### G4. Nieuw regeltype / operator

1. Enum uitbreiden in `schema.prisma` (`RuleFieldType`/`RuleOperator`) →
   migratie.
2. `evaluateCondition()` in `lib/rules/engine.ts`: nieuwe case.
3. Zod in `/api/rules` (`conditionSchema`-enums) en UI
   `rules/page.tsx` (opties/labels).
4. Test via ingest met testregel (zie `e2e-api.mts`-patroon).

### G5. Nieuwe background job

1. Nieuwe checkfunctie in `src/lib/jobs/<naam>.ts` (idempotent!).
2. Eigen `jobName`-constante; uitbreiding in `runner.ts` (of generieke
   job-map) met slot-planning.
3. Log altijd in `job_runs`; test met gecontroleerde `now` (vaste data buiten
   lookback, zoals `test-jobs.mts` doet).

### G6. Nieuw rapporttype

1. Object toevoegen aan `reports`-map in `src/app/api/reports/route.ts`
   (`columns` + `build()`; soft delete filteren!).
2. Kaartje toevoegen aan `REPORT_TYPES` in `reports/page.tsx`.

---

## H. Regels en conventies

**Bestaande regels (geverifieerd in code):**

1. Import-pad: `@/*` → `src/*` (tsconfig paths; tsx respecteert dit).
2. Prisma-kolommen `snake_case` via `@map`; TypeScript-velden `camelCase`.
3. Elke protected route-handler roept `requireAuth`/`requireAdmin` aan — de
   proxy is een extra laag, geen vervanging.
4. Sessie = DB-rij + httpOnly-cookie; **geen** JWT in tokens.
5. API-keys worden **alleen** als SHA-256-hash opgeslagen; raw key 1× tonen.
6. Input-validatie via Zod vóór Prisma; fout = 400 + `details`.
7. Soft delete voor `Person`/`IngestSource`: nooit fysiek verwijderen via
   DELETE-routes; filter `deletedAt: null` in actieve queries; definitief
   alleen admin + `confirm=true`.
8. Datum-responses als ISO-strings; request-datums parsen met
   `new Date(...)` + NaN-check.
9. Gevoelige/wijzigingsacties loggen via `logAudit()`.
10. UI-taal: Nederlands; UTF-8 bronbestanden (geen mojibake).
11. Client-data via `fetch` + lokaal state; kaart-/polygon-components zijn
    client-only (`dynamic(..., { ssr: false })`).
12. Lint: `react-hooks/set-state-in-effect` en `react-hooks/purity` staan
    bewust uit (fetch-in-effect-conventie); overige warnings serieus nemen.
13. Jobs zijn idempotent (slot-key + data-markers); test- scripts ruimen
    eigen data op.

**Aanbevolen regels (nog niet formeel aangenomen):**

1. Nieuwe routes toevoegen aan `proxy.matcher` voor defence-in-depth.
2. `validation-ingest.ts` samenvoegen met `validation.ts` (duplicaat).
3. `src/types/` verwijderen of vullen (nu leeg).
4. `processStaleEvents()` koppelen aan de job-runner of verwijderen.
5. Unit-tests per lib-module (nu alleen script-gebaseerde integration-tests).
6. Rate-limiting op `/api/auth/login` en `/api/ingest`.

---

## I. Testen en verificatie

Commands (geverifieerd in `package.json`):

| Command | Doet | Server nodig |
|---|---|---|
| `npm run typecheck` | `tsc --noEmit` (strict) | nee |
| `npm run lint` | ESLint (0 errors vereist) | nee |
| `npm run build` | Productiebuild (Turbopack) | nee |
| `npm start` | Serveert build op :3000 | — |
| `npm run test:e2e` | 11 API smoke-checks | ja |
| `npm run test:trash` | 72 checks soft delete/prullenbak/authz | ja |
| `npm run test:jobs` | 28 checks deadline-job (gecontroleerde `now`) | nee |
| `npm run test:locations` | 59 checks locaties/routes/import/geocode (parser lokaal, API: server) | deels |
| `npm run jobs:once` | Eén jobslag | nee (DB wel) |
| `npm run db:seed` | Admin seeden | DB |
| `npm run admin:reset-password -- <pw>` | Wachtwoord resetten | DB |

**Verificatievolgorde voor elke wijziging:**

```powershell
npm run typecheck
npm run lint
npm run build
npm start                      # venster 1
npm run test:e2e               # venster 2
npm run test:trash
npm run test:jobs
```

Waar tests staan: alleen in `scripts/` (geen testframework geïnstalleerd).
Bij wijzigingen in soft delete → `test-trash.mts`; in jobs → `test-jobs.mts`;
in auth/ingest/keys → `e2e-api.mts`. Nieuwe features: voeg checks toe aan een
van deze scripts (patroon: `assert(cond, "melding")` + opruimen testdata).

---

## J. Veelvoorkomende wijzigingsscenario's

**1. Nieuwe pagina + menu-item**
Inspecteer: `layout.tsx` (NAV_ITEMS), voorbeeldpagina `persons/page.tsx`.
Volgorde: pagina maken → NAV_ITEMS → typecheck/build → handmatig inloggen en
openen.

**2. Nieuw API-endpoint**
Inspecteer: vergelijkbare route (bv. `persons/route.ts`),
`api-helpers.ts`, `proxy.ts`. Volgorde: route.ts → Zod → requireAuth →
prisma → test-check toevoegen → e2e/trash-test draaien.

**3. Bedrijfsregel wijzigen (regel-engine)**
Inspecteer: `rules/engine.ts` (`evaluateCondition`, `evaluateRules`),
`rules/events.ts`, `/api/rules`, `rules/page.tsx`. Volgorde: engine-case →
Zod-enum → UI-opties → handmatige ingest-test (API-key + POST /api/ingest)
of e2e-uitbreiding.

**4. Databaseveld toevoegen**
Inspecteer: `schema.prisma` + betrokken route(s). Volgorde: schema →
`prisma migrate dev` → Zod → route-serialisatie → UI-formulier →
typecheck/build/tests.

**5. Externe dienst integreren (kaart/geocoding)**
Inspecteer: `tracking-map.tsx` ( Photon/OSM-patroon). Conventie: geen
API-keys in client; OSM-ecosysteem; attributie behouden.

**6. Auth/permissions wijzigen**
Inspecteer: `auth-session.ts`, `api-helpers.ts`, `proxy.ts`,
`users/route.ts`. Wijzigingen hier raken **alle** routes — draai alle drie
de testscripts.

**7. Bug in bestaande feature**
Volg: UI-pagina → haar `/api/…`-route → Prisma-query → model. Check
soft-delete-filters als data "verdwijnt". Check mojibake bij vreemde tekens
(`â€`-patroon = dubbel-gecodeerde UTF-8).

**8. Shared component refactoren (`TrackingMap`)**
Inspecteer alle aanroeppagina's (dashboard, map, history). Props zijn het
contract; `MapVehicle`-type aanpassen = alle drie bijwerken. Test: kaart,
zoekbalk, locate, fullscreen, trail, volgen.

**9. Tests voor bestaande module**
Kopieer patroon uit `test-trash.mts` (login-jar + `req()` + prisma-asserts +
opschonen). Voeg npm-script toe. Gebruik unieke testnamen met `Date.now()`.

---

## K. Beperkingen en risicogebieden

| Gebied | Risico | Safeguard |
|---|---|---|
| `prisma/migrations/` + schema | Data-verlies/breach in productie | Alleen additieve migraties; nooit `migrate reset` op productiedata; test op dev |
| Soft delete + purge-cascade | Fysiek verwijderen van personen/voertuigen wist GPS-punten/events (DB-cascade) | Purge = admin + confirm + tellingen; UI toont consequenties |
| `auth-session.ts` + `proxy.ts` | Alle toegang loopt hierheen | Kleine, geteste wijzigingen; e2e + trash + jobs testen |
| `ingest`-upsert op naam | Naam is identiteit van tracker; uniek in DB (incl. prullenbak) | Namen niet hernoemen zonder overleg; 409-gedrag is bewust |
| `processIngest` in ingest | Events/meldingen direct bij elk GPS-punt | Fire-and-forget met catch; skip bij soft-deleted; cooldown 5 min |
| `TrackingMap` | Gebruikt op 3 pagina's | Props-contract behouden; alle aanroeppagina's testen |
| `job_runs` + `slotKey` | Idempotentie breekt als rijen verdwijnen | Niet handmatig wissen in productie; jobs draaien buiten piek |
| `.env` / secrets | Database + admin-credentials | Nooit in git/docs; `NEXT_PUBLIC_*` is publiek |
| API-key in `localStorage` (browser-delen) | Key leesbaar voor XSS | Self-hosted app; key alleen voor eigen ingest; intrekken via API Keys-pagina |
| Eén admin-account | Geen publieke registratie | Extra gebruikers alleen via DB/admin-PATCH; seed-opdrachten |

**Onzekerheden / niet volledig geïnspecteerd:** `android-location-agent/`
(Kotlin, aparte codebase); `docs/presentatie.html` en PDF's (niet bron-relevante
docs); `processStaleEvents`-gedrag in productie (niet aangeroepen);
`AUTH_SECRET`/`AUTH_TRUST_HOST` staan in `.env` maar hebben geen
gebruikers in `src/`.

---

## L. Onderhoud van deze gids

Werk `CODEBASE_GUIDE.md` bij als een wijziging raakt:

- nieuwe mappen/routes of verwijderde bestanden (secties B, C, D)
- exports in `lib/` of `components/` (sectie E)
- dataflow of modulegrenzen (F)
- auth-, soft-delete- of job-regels (G, H, K)
- testscripts of npm-scripts (I)
- nieuwe beslissing → ook `docs/beslissingen/` + index-lijst

Bij twijfel: paden en symbolen opnieuw verifiëren met grep/read voordat je
de gids aanpast. Bewaar deze gids als centraal punt; splits alleen uit bij
groeipijn (>1500 regels) naar `docs/`.
