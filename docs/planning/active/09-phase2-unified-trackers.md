# Plan 09 — Phase 2: Core logic, automatische tracker-registratie & mobile-first app

**Status:** actief
**Prioriteit:** HOOG — hart van het platform (identiteit + registratie + mobiel)
**Datum:** 2026-11-14

## Doel

Eén centraal tracker-systeem voor bron 1 (Teltonika FMC920) en bron 2 (mobiele
app). Nieuwe trackers worden **automatisch geregistreerd** bij eerste geldige
data; geen handmatige aanmaak vereist. Website toont ze direct. Mobile-first
design, professionele uitstraling, APK-installatie.

## Geïnspecteerd (bestaande staat)

- `IngestSource` = huidige "voertuig/bron" (name @unique, positie, soft delete,
  tracker-velden `trackerSerial`/`trackerSource`); kaart/dashboard lezen dit.
- `GpsDevice` = hardware-registry (IMEI @unique, status pending/active/revoked,
  vehicleId-koppeling). Hardware-ingest geeft **403 bij onbekende IMEI** (het
  probleem dat we oplossen).
- Mobiel: `/api/ingest` met gebruikers-API-key (`gpta_`) + identiteit = `name`.
- Android-app (`android-location-agent/`): generieke sender (Configurabele
  API's + body-templates), Compose + Room (logs/configs, **geen offline
  queue**), foreground service + background-permissies aanwezig, tabs
  API's/Status/Terminal. Geen install-UUID, geen tracker-naam/metadata.
- UI: nav "Trackers & Apparaten" → `/app/devices` (GpsDevice-lijst);
  `/app/trackers` + `/api/trackers` bestaan maar zijn **niet in de nav**
  (wees pagina). `Settings` heeft geen download-URL.

## Architectuurbeslissingen

### Eén tracker-model = `IngestSource` (additieve migratie)

Nieuwe velden op `IngestSource` (de entiteit die al posities/history bezit):

| Veld | Betekenis |
|---|---|
| `externalId @unique` | IMEI (hardware) of install-UUID (mobiel) — **identiteit, nooit naam** |
| `sourceType` | `"hardware"` \| `"mobile"` \| `"legacy"` (backfill uit `trackerSource`) |
| `metadata Json` | **beheerders**-metadata (alleen website-PATCH; ingest raakt dit nooit) |
| `deviceMetadata Json` | **apparaat**-metadata (app stuurt; website toont apart) |
| `verificationStatus` | `"unverified"` \| `"verified"` \| `"revoked"` — backfill bestaand = verified |
| `firstSeenAt` | eerste registratie (backfill = createdAt) |
| `deviceSecretHash @unique` | SHA-256 van mobiele `trackerKey` (enrolment-credential) |

`GpsDevice` blijft hardware-sidecar (IMEI-details/protocol/firmware), 1:1
gekoppeld via `vehicleId`. Eén management-UI, twee protocol-specifieke details.

### Registratie & authenticatie

- **Hardware**: onbekende IMEI → automatisch `GpsDevice(status=active)` +
  `IngestSource(externalId=imei, sourceType=hardware, verificationStatus=unverified,
  owner=null)` + koppeling → data stroomt meteen (geen quarantine meer voor
  nieuwe devices). `revoked` blijft geweigerd (admin-controle). IMEI alleen is
  geen sterk bewijs (AVL-protocol kent geen device-geheim) — beperking
  expliciet gedocumenteerd; beveiliging = tunnel+TLS+HTTP-key, admin-pairing
  (verify), revocatie. Rate-limit op nieuwe-IMEI-creatie per IP voorkomt
  spam-registratie.
- **Mobiel**: `POST /api/trackers/enroll` (rate-limited, auth = gebruikers-
  `X-API-Key` → eigenaarschap) met `installId` + naam + metadata → maakt
  tracker (unverified) of rotate key bij zelfde eigenaar → retourneert
  `trackerKey` (1× getoond, hash opgeslagen). GPS daarna met
  `X-Tracker-Key` (hash-lookup op unieke index). Alleen de eigenaar/admin kan
  een installId claimen → identiteit alleen is onvoldoende om te imiteren.
- Legacy-pad (`X-API-Key` + `name`-upsert, browser-delen) blijft werken.

### Metadata-regels (sync zonder admin-data te overschrijven)

- Zod-schema: bekende velden (device_name, vehicle_type, vehicle_registration,
  company, driver, department) + `customFields` (≤50 keys, key ≤60, value ≤200)
  — onbekende sleutels worden gestript, geen migratie per veld nodig.
- Naamregel: app stuurt naam in `deviceMetadata.device_name`; `displayName`
  wordt alleen bijgewerkt als de binnenkomende naam **verschilt** van het
  laatst door het apparaat gezonden naam → admin-hernoeming blijft staan tot
  de app écht hernoemt.
- `metadata` (admin) wordt door ingest **nooit** aangeraakt.

### UI

- `/app/devices` wordt de **uniforme Trackers-pagina** (nav-URL blijft):
  lijst met zoek/filter (naam, externalId, kenteken, driver, bron, status),
  detail met algemeen/hardware/metadata/GPS-history/verificatie-acties.
  Wees-pagina `/app/trackers` verwijderd (nooit in nav; vervangen).
- Installatie-paneel op de Trackers-pagina + `Settings.appDownloadUrl`
  (admin, leeg = geen fake link). APK-build-workflow gedocumenteerd.

### Overig

- Mobiel-first: cards i.p.v. tables op small screens, animaties in globals.css
  met `prefers-reduced-motion`-guard, consistente loading-states.
- Performance: icon-cache in TrackingMap, serverse paginatie trackers,
  bestaande polling-intervallen blijven.
- Multi-tenant: ownerUserId op tracker; admin ziet alles, gebruiker eigen
  (bestaand patroon).

## Stappen (commit na elke groene stap)

- [ ] **S1 — Migratie + libs**: `add_tracker_identity` (additief + backfill),
      `src/lib/rate-limit.ts` (uit login-route gehaald), `src/lib/tracker-identity.ts`
      (metadata-Zod, find-or-create, naam-regels).
- [ ] **S2 — Backend flows**: `/api/trackers/enroll`, tracker-key-pad in
      `/api/ingest`, auto-registratie in `/api/ingest/teltonika` (+ nieuwe-IMEI
      rate-limit).
- [ ] **S3 — Trackers-API**: unified GET (zoek/filter/paginatie),
      GET/[id] detail (punten+device+metadata), PATCH (admin: naam/metadata),
      verify/revoke; `Settings.appDownloadUrl`.
- [ ] **S4 — Website**: devices-pagina ombouwen tot uniforme Trackers-UI
      (cards mobile / table desktop, detail, verificatie, install-panel),
      wees-pagina weg, nav bijwerken.
- [ ] **S5 — Android**: install-UUID (persistent), Tracker-tab (naam,
      metadata-editor, enroll, status: GPS/accuracy/batterij/laatste
      verzending), platform-sender met rijke payload, offline queue (Room) +
      retry, naam/metadata-sync, batterij/altitude/heading.
- [ ] **S6 — Design & mobile-first**: animaties + reduced-motion, responsive
      cards/tables, loading-states, navigatie-check.
- [ ] **S7 — Performance**: TrackingMap icon-cache, paginatie, render-checks.
- [ ] **S8 — Tests & rapport**: API-tests scenarios A/B/C/D/F, Playwright
      trackers-UI, volledige Phase-1-suite, Android-build (indien SDK),
      eindrapport.

## Acceptatie (kern)

- Onbekende IMEI → tracker automatisch zichtbaar op website; geen 403 meer.
- Nieuwe app → enrolment → GPS → tracker automatisch zichtbaar; naam/metadata
  syncen; admin-velden blijven behouden (scenario D).
- Bestaande records: geen duplicaten bij herhaalde data (scenario C).
- Revoked device wordt geweigerd; trackerKey steelt geen andere tracker.
- Alle Phase-1 tests blijven groen; nieuwe tests groen.
