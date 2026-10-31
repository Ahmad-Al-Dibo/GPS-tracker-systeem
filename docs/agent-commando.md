# Agent Commando — werkcommando's voor deze repo

Korte commando's en conventies zodat elke agent-sessie dezelfde stappen volgt.

## Basis

| Actie | Commando |
| --- | --- |
| Dev-server starten | `npm run dev` (poort 3000; HTTPS optie: `npx next dev --experimental-https`) |
| Build | `npm run build` |
| Productie starten | `npm start` |
| Lint | `npm run lint` |
| Typecheck | `npm run typecheck` |
| Prisma generate | `npx prisma generate` |
| Migratie uitvoeren | `npx prisma migrate deploy` |
| Seed (demo-users) | `npm run db:seed` |
| API smoke-test (server moet draaien) | `npm run test:e2e` |
| Database reset (dev) | `npx prisma migrate reset` |

## Database (lokaal)

- PostgreSQL 18 op `localhost:5432`, gebruiker `postgres`.
- DATABASE_URL in `.env` (niet committen; `.env.example` is leidend).

## Demo-accounts (seed, MVP v2)

| Rol | Username | Wachtwoord |
| --- | --- | --- |
| admin | `admin` | `Admin123!` |
| worker | `werknemer` | `Werk123!` |

## Werkvolgorde per sessie

1. Lees `docs/planning/active/` en `docs/beslissingen/` voor lopend plan en vastgelegde keuzes.
2. Voer wijzigingen uit; modules gescheiden (`lib/`, `app/api/`, pagina's).
3. Draai `npm run typecheck` (en indien mogelijk `npm run test:e2e`) vóór afronden.
4. Log nooit locatiegegevens of wachtwoorden.

## Conventies (MVP v2)

- Sessie: DB-rij + httpOnly cookie `gps_session_id` (beslissing 001), niet JWT-only.
- Login: **username** + wachtwoord (beslissing 002).
- Status: alleen server-side via `computeWorkerStatus` in `src/lib/presence.ts` (beslissing 004).
- Locatie: alleen laatste fix per worker in `location_shares` (beslissing 003).
- Worker-id altijd uit sessie, nooit uit request-body.
- Admin-endpoints: server-side rolcheck via `requireAdmin`.
- Tracking claimt geen background-tracking (beslissing 005).
