# MVP Plan — Phone GPS Tracking Agent

**Status:** afgerond (2026-11-05) — MVP voltooid, zie huidige plannen — vervangen door `01-mvp-v2-heartbeat-sharing.md` (2026-10-10). Historisch.  
**Datum:** 2026-10-09  
**Doel:** Werkende MVP waarin een werknemer met een telefoon GPS-punten stuurt naar de backend en een admin dit live op een kaart ziet.

## Stack

| Onderdeel | Keuze |
| --- | --- |
| Framework | Next.js 15 (App Router) + TypeScript |
| Database | PostgreSQL 18 + PostGIS 3.6 (lokaal) |
| ORM | Prisma + raw SQL voor PostGIS-operaties |
| Auth | Auth.js (NextAuth v5) met credentials + JWT-rol in sessie |
| Validatie | Zod |
| Kaart | Leaflet + OpenStreetMap-tegels |
| Live updates | Server-Sent Events (SSE) |
| Styling | Tailwind CSS |

## Datamodel (kern)

- `users` — accounts, rol `ADMIN` | `EMPLOYEE`
- `devices` — apparaten gekoppeld aan eigenaar; `source_type`, `revoked_at`
- `tracking_sessions` — trackingperioden; `active` | `stopped`
- `gps_points` — waarnemingen; `observed_at`, `received_at`, PostGIS `geography(Point,4326)`, uniek op `(session_id, client_point_id)`
- `audit_logs` — beheeracties

Primaire sleutels: UUID. Snelheid intern in m/s; interface toont km/h.

## API (prefix `/api/v1`)

- `GET /me`
- `GET|POST /devices`, `PATCH|DELETE /devices/:id`
- `POST /devices/:id/sessions`, `POST /sessions/:id/stop`, `GET /sessions/:id`
- `POST /sessions/:id/points` (idempotent via `clientPointId`)
- `GET /devices/:id/history`
- Admin: `GET /admin/tracking`, `GET /admin/devices/:id/history`, `GET /admin/tracking/events` (SSE)

## Statuslogica

| Dimensie | Waarden |
| --- | --- |
| Tracking | `active`, `stopped`, `revoked` |
| Data | `fresh` (<20s), `stale` (20–60s), `offline` (>60s), `unknown` |
| Beweging | `moving`, `stationary`, `unknown` (op basis van snelheid + accuracy) |

## Fasen (implementatievolgorde)

### Fase 1 — Fundament
1. Next.js-project + TypeScript + Tailwind configureren
2. DATABASE_URL instellen, PostGIS-extensie activeren
3. Prisma-schema + migratie + seed (admin + employee)
4. Auth.js credentials-login, rollen, middleware-bescherming

### Fase 2 — Phone GPS Agent
5. Apparaatregistratie (API + UI op mobiele pagina)
6. Start/stop-sessie endpoints
7. `navigator.geolocation.watchPosition`-koppeling
8. Verzendlaag: interval ~5s, wachtrij bij netwerkfout, idempotentie, rate limit

### Fase 3 — Admin dashboard
9. Apparaatoverzicht met statussen
10. Leaflet-kaart met laatste positie per apparaat
11. SSE-stream + snapshot-bij-herverbinding

### Fase 4 — Historie en kwaliteit
12. History-endpoints + polylines op kaart
13. Testscenario's: dubbele punten, gestopte sessie, offline, autorisatie

## Definition of Done

Zie hoofdstuk 8 van de bronspecificatie: login → registratie → tracking starten → punten opslaan → admin ziet live kaart → history → stoppen → autorisatie → juiste statussen bij uitval.

## Buiten scope (latere fase)

Native achtergrondtracking, Teltonika FMC920-adapter, routeoptimalisatie, bewijs van bezorging. Adapter-gedrag: hardware voedt dezelfde interne locatie-interface.

## Risico's / aandachtspunten

- Prisma kent geen PostGIS-typen → geo-operaties via raw SQL (`$queryRaw`).
- Leaflet levert geen tegels → OSM-tegels met attribution respecteren; productie: eigen tileprovider.
- SSE in-process → in MVP enkele node; later Redis pub/sub bij horizontale schaal.
- Locatiegegevens zijn persoonsgegevens (AVG): geen locatie in applicatielogs, bewaarbeleid later.
