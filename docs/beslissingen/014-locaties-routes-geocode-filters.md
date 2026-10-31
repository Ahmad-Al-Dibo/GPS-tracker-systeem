# Beslissing 014 — Locaties & Routes, geocode-proxy, kaartfilters en defect-fixes

**Datum:** 2026-10-19
**Status:** vastgelegd

## Context

Het platform miste locatie-/routemanagement. Twee bestaande defecten: (1) de
kaartzoekbalk navigeerde niet betrouwbaar bij Enter (debounce-leegte +
stale-response-race); (2) geofences werden nergens op de hoofdkaart getekend
(`TrackingMap` had geen zone-laag). Het losse project `Routes-maneger`
(FastAPI-adresextracteur) diende als **referentie voor concepten** (niet code):
gestructureerd adresbegrip, deterministische dedupe via genormaliseerde
vergelijkingssleutel (original behouden), één-adres-per-regel-formaat.

## Keuzes

### 1. Defect-fixes (vóór nieuwe features)

- **Zoekbalk** (`src/components/tracking-map.tsx`, `SearchControl`): zoekt nu
  via **server-proxy** `/api/geocode`; Enter zoekt direct (ook als debounce nog
  geen resultaten gaf); sequentie-guard (`seqRef`) negeert verouderde
  antwoorden; ArrowUp/Down + Enter kiezen een resultaat; Escape sluit; zoekknop;
  foutmeldingen zichtbaar.
- **Geofence-laag**: `TrackingMap` accepteert `zones` en rendert polygonen
  (kleur + fillOpacity 0.14) met klik-popup; dashboard, Kaart-pagina en
  Locaties-pagina laden zones zelf en passeren ze gefilterd.

### 2. Server-side geocoding (`src/lib/geocode.ts` + `/api/geocode`)

- **Photon** (primair, geen key) + **Nominatim** (fallback), centraal op de
  server (geen keys in de browser, centrale rate-limit, vervangbare provider).
- Photon: geen `lang=nl` (ondersteunt het niet — 400); Nominatim vereist een
  geldige **User-Agent** (403 anders).
- Timeouts (8s), max 6 resultaten, 502 bij totale uitval; UI toont altijd een
  keuzelijst bij meerdere resultaten (nooit stilzwijgend eerste resultaat).
- **OSRM-demo** voor straatroutes (`fetchRoadRoute`, `/api/routes/road`):
  optioneel; bij falen valt de kaart terug op een **gestreepte rechte lijn** +
  expliciete melding ("geen navigatie-route beschikbaar").

### 3. Databeeld (migratie `20261019194942_locations_routes`)

- `ManagedLocation`: naam, adres, coords, geocode-provider/label, type
  (permanent|temporary), `startsAt`/`expiresAt`, notities, kleur, soft delete.
  **Verval is exclusief**: `expiresAt <= nu` = verlopen; backend bepaalt actief
  (query), niet een frontend-timer. Actief = permanent, of temporary binnen
  geldigheidsvenster; verlopen locaties blijven bewaard (historische weergave).
- `Route` + `RoutePoint`: **snapshot-besluit** — routepunten bewaren naam/
  adres/coords als kopie plus optionele `locationId`; wijzigingen aan een
  gedeelde locatie corrupteren bestaande routes niet (getest).
- Soft delete op locaties en routes (geen stille data-verwijdering).

### 4. Import (`src/lib/locations/import.ts`, `/api/locations/import` + `/batch`)

- Formaten: (a) één adres per regel (komma's horen bij adressen — parser
  splitst **niet** blind; optionele `Label | adres`-syntax), (b) CSV met
  `name,address,type,expires_at,notes` en quote-ondersteuning.
- Workflow: bestand → analyse + geocode (max 50/verzoek, ~1,1s pauze tussen
  aanroepen) → preview-tabel per rij (status/keuzelijst bij ambigue
  resultaten) → batch-create met dedupe.
- **Dedupe = adres-identiteit**: genormaliseerde sleutel (lowercase, `,;.!?` →
  spatie); geen fuzzy matching; in-file én DB-duplicates gemeld, nooit stil
  overgeslagen in de rapportage.
- CSV-formule-injectie beveiligd bij rapport-export (`=`,`+`,`-`,`@` → `'`).

### 5. Gedeelde kaartfilters (`src/lib/map-filters.ts`, `src/components/map-filters.tsx`)

- Lagen: voertuigen, geofences, permanente/tijdelijke/verlopen locaties, route.
- Per-pagina defaults + `available`-set (geen betekenisloze filters); filters
  sturen **echte** datalaag (visible → props → kaart); voorkeuren per sessie
  per pagina (geen globale persistenty — past niet bij huidige architectuur).
- Legenda op elke kaart met zichtbare lagen; personen hebben geen eigen
  locatiebron in dit model → geen personen-laag (gedocumenteerd).

### 6. Navigatie

- Nieuw item **Locaties & Routes** (`/app/locations`) met tabs Locaties /
  Routes / Import; kaartselectie vanaf Kaart-pagina → `/app/locations?selLat…`
  opent het aanmaakformulier met vooraf ingevulde selectie.

## Getest (`npm run test:locations` — 59 checks, uitgevoerd)

Parser (16), locaties API incl. verlooptijd backend-bepaald (16),
geocode-proxy (4), routes incl. volgorde/persistente/snapshot/OSRM (14),
import+batch (9). Regressie: e2e 11/11, trash 72/72, jobs 28/28 — alle groen.

## Bekende beperkingen

- Photon/Nominatim/OSRM zijn **publieke demo-services** — productie-serieus
  gebruik vraagt eigen endpoints/keys (provider zit achter één interface).
- Importgeocode is gesynchroniseerd per verzoek (max 50 rijen); grotere
  bestanden worden in delen aangeboden (client herhaalt).
- Routelijn zonder OSRM = rechte lijn (expliciet gemarkeerd als fallback).
