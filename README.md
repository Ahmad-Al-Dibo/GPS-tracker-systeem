# GPS Tracking — MVP v2

Werknemer deelt locatie via de browser (alleen bij actieve pagina). Admin ziet werknemers, statussen en laatste locatie op de kaart.

## Stack

- Next.js 16 (App Router) + TypeScript + Tailwind
- PostgreSQL 18 (lokal), Prisma
- DB-sessies + httpOnly cookie (beslissing 001)
- Leaflet + OpenStreetMap
- Heartbeat-aanwezigheid, 4-staten model (beslissing 004)

## Snel starten

```bash
cp .env.example .env
npm install
npx prisma migrate deploy
npm run db:seed
npm run dev          # of: npm run build && npm start
```

### Demo-accounts

| Rol | Username | Wachtwoord |
| --- | --- | --- |
| Admin | `admin` | `Admin123!` |
| Worker | `werknemer` | `Werk123!` |

Pagina’s: `/login`, `/register` (worker), `/track` (worker), `/admin` (admin).

## Statusmodel (server-side)

| Status | Betekenis |
| --- | --- |
| `sharing` | sessie actief + heartbeat recent + sharing aan |
| `online` | sessie actief + heartbeat recent + sharing uit |
| `offline` | heartbeat ouder dan 75s |
| `logged_out` | sessie ingetrokken of verlopen |

Heartbeat client: ~20s. Tracking werkt alleen bij actieve pagina (beslissing 005).

## API (samenvatting)

| Endpoint | Doel |
| --- | --- |
| `POST /api/auth/register` | worker-account |
| `POST /api/auth/login` / `logout` | sessie |
| `GET /api/me` | gebruiker + status |
| `POST /api/tracking/start` / `stop` | sharing |
| `POST /api/tracking/heartbeat` | aanwezigheid |
| `POST /api/tracking/location` | laatste fix |
| `GET /api/admin/workers` | lijst + statussen |
| `GET /api/admin/locations` | markers kaart |

## Scripts

| Commando | Doel |
| --- | --- |
| `npm run dev` | development |
| `npm run build` / `npm start` | productie |
| `npm run typecheck` | TypeScript |
| `npm run db:seed` | demo-accounts |
| `npm run test:e2e` | API smoke-test (server moet draaien) |

## Documentatie

- `docs/planning/active/01-mvp-v2-heartbeat-sharing.md` — plan v2
- `docs/beslissingen/` — architectuurbeslissingen
- `docs/agent-commando.md` — commando’s voor agent-sessies
