# MVP Plan v2 — Heartbeat + gedeelde statussen

**Status:** afgerond (2026-11-05) — heartbeat/status ingebouwd — heartbeat/status blijven; uitgebouwd door `02-mvp-v3-officieel-ontwerp.md` (2026-10-11). Bron: officiële ontwerpdoc.  
**Datum:** 2026-10-10  
**Aanleiding:** vereenvoudigd statusmodel (sharing/online/offline/logged_out), heartbeat-aanwezigheid, alleen laatste locatie per werknemer in MVP.

## Kernversies t.o.v. v1

| Onderdeel | v1 (gedeeltelijk gebouwd) | v2 (dit plan) |
| --- | --- | --- |
| Status | tracking/data/beweging in devices | 4 statussen: `sharing`, `online`, `offline`, `logged_out` |
| Aanwezigheid | lastSeen uit GPS-punten | expliciete heartbeat (~20s) + server-timeout (60–90s) |
| Locatie-opslag | volledige GPS-punten + sessies | alleen **laatste locatie** per werknemer (`location_shares`); historie later |
| Sessies | tracking_sessions per start/stop | browser-sessies met `last_heartbeat_at`, `expires_at`, `revoked_at` |
| Start/stop | aparte tracking-sessie | `sharing_enabled` op locatie-deel |

Bestaande Next.js + TypeScript + PostgreSQL + PostGIS + Prisma blijven staan; dit is een **herstructurering**, geen andere stack.

## Statusmodel (server-side, berekend)

| Status | Voorwaarden (server) |
| --- | --- |
| `sharing` | sessie actief **én** `sharing_enabled` **én** heartbeat recent |
| `online` | sessie actief, sharing uit, heartbeat recent |
| `offline` | sessie nog niet verlopen, maar heartbeat ouder dan timeout |
| `logged_out` | sessie `revoked_at` gezet (uitloggen) of verlopen |

Drempels (configureerbaar): heartbeat-interval client ~20s; offline na 75s zonder heartbeat; sessie-expiry langer (bijv. 12u of tot logout).

## Datamodel (doel)

### `users`
`id`, `username` (uniek), `password_hash`, `role` (`admin`|`worker`), `created_at`

### `sessions`
`id`, `user_id`, `last_heartbeat_at`, `expires_at`, `revoked_at`

### `location_shares`
`user_id` (uniek per worker), `sharing_enabled`, `latitude`, `longitude`, `accuracy_meters`, `location_updated_at`

Optioneel later: `gps_history` / `tracking_sessions` voor routes (fase 6).

## API-contract

| Methode + pad | Doel |
| --- | --- |
| `POST /api/auth/register` | worker-account maken (of admin-seed) |
| `POST /api/auth/login` | sessie starten |
| `POST /api/auth/logout` | sessie intrekken |
| `GET /api/me` | account + sessiestatus |
| `POST /api/tracking/start` | sharing aanzetten (na sessiecheck) |
| `POST /api/tracking/location` | laatste coördinaten opslaan |
| `POST /api/tracking/heartbeat` | sessie-communicatie bevestigen |
| `POST /api/tracking/stop` | sharing uitzetten |
| `GET /api/admin/workers` | werknemerslijst + status |
| `GET /api/admin/locations` | laatste locaties voor kaart |

Regels: worker-id altijd uit **server-sessie**, nooit uit request-body; admin-endpoints checken rol server-side.

## Client (worker)

1. Login → trackingpagina open.
2. **Start sharing** → locatiepermission + `watchPosition` (alleen terwijl pagina actief is).
3. Heartbeat POST elke ~20s (ook zonder nieuwe GPS-fix).
4. Locatieupdates naar server (interval/afstandsgestuurd, niet blind per event).
5. **Stop sharing** → `clearWatch` + sharing uit.
6. **Uitloggen** → logout API + sessie ongeldig.

**Browser-limiet expliciet:** tab-sluit/telefoon-lock niet betrouwbaar detecteerbaar → heartbeat + timeout. Geen betrouwbare background-GPS in browser; werk tijdens actieve trackingpagina. Native app later voor background.

## Admin dashboard

- Lijst werknemers met status-badge (`sharing`/`online`/`offline`/`logged_out`)
- Laatste locatie + tijd op kaart (Leaflet/OSM)
- Poll of SSE om de ~5s; bij reconnect snapshot ophalen

## Implementatievolgorde

### Fase 1 — Auth
- Username/password register + login + logout (bcrypt)
- Eenmalige admin-aanmaak (seed of commando)
- Sessiecookie of JWT met sessie-id in DB

### Fase 2 — Presence
- `sessions` + heartbeat-endpoint + expiry-regels
- Statusberekening (4 waarden) op server
- Client heartbeat-timer op trackingpagina

### Fase 3 — Location sharing
- Start/stop sharing
- Location-endpoint: validatie lat/lon/accuracy/tijd
- `location_shares` upsert (alleen laatste)
- Client: permission, watchPosition, throttled submit

### Fase 4 — Admin
- Workers-lijst + statusindicators
- Kaart met markers + laatste update-tijd
- Poll/SSE

### Fase 5 — Betrouwbaarheid/privacy
- Session-expiry, permission-denied UI, stale-waarschuwingen
- Tests: gesloten tab, netwerkuitval, logout tijdens sharing
- AVG: geen locatie in logs, bewaarbeleid later

### Fase 6 — Roadmap (niet in MVP)
- Routes, stops, toewijzingen, locatiehistorie

## Relatie met bestaande code

**Prototype (huidige repo):** Next.js 16 + TypeScript + PostgreSQL/PostGIS + Prisma + Auth.js + Leaflet + SSE; `/track` en `/admin` werken; e2e API-tests groen; HTTPS via tunnel voor telefoon.

| Gebied | Actie |
| --- | --- |
| Auth | Auth.js behouden; username i.p.v. e-mail optioneel; logout-explicit |
| Users | `name`/`email` → `username` of behouden + veld toevoegen |
| Devices/sessies/GPS-punten | vervangen door `sessions` + `location_shares` (historie later weer) |
| Status | huidige dataStatus/movement vervangen door 4-staten model |
| Heartbeat | nieuw (client + server) |
| Admin | huidige tracking-snapshot aanpassen naar workers + laatste locatie |
| Kaart | Leaflet behouden |
| PostGIS | optional voor MVP; lat/lon kolommen volstaan tot fase 6 |

## Definition of Done (v2)

1. Worker inlogt (username/wachtwoord).  
2. Start sharing → locatiepermission → server slaat laatste locatie op.  
3. Admin ziet status `sharing` en marker met laatste positie/tijd.  
4. Heartbeat houdt `online`/`sharing` in stand; zonder heartbeat → `offline` na timeout.  
5. Stop sharing → geen updates meer; status wordt `online`.  
6. Logout → `logged_out`; andere users geen data van elkaar.  
7. Tab dicht / netwerk weg → offline na timeout; geen false "sharing" eeuwig.

## Open punten

- Behouden van e-mail naast username? (voorwaarde: unieke login)  
- Sessiestrategie: DB-session vs JWT+heartbeat  
- Historie-tabel nu al leeglaten of skeleton voor fase 6  
