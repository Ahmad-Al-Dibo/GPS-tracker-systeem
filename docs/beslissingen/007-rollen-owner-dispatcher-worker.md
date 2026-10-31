# Beslissing 007 — Rollen: owner (CLI), dispatcher, worker

**Datum:** 2026-10-11  
**Status:** vastgelegd  
**Bron:** ontwerp §1.1, §5.3

## Keuze

| Rol | Aanmaak | Rechten (MVP) |
| --- | --- | --- |
| `owner` | Alleen server-side CLI (`npm run owner:init`), maximaal één | Alles: instellingen, rollen, blokkeren, audit, geschiedenis |
| `dispatcher` | Door owner via dashboard | Live locaties + werknemerslijst + toegestane geschiedenis |
| `worker` | Openbare registratie | Eigen profiel + eigen start/stop delen |

Huidige `admin`-rol uit v2 wordt vervangen/geherschoold naar `owner` (+ optioneel dispatcher).

## Gevolgen

- Seed maakt geen admin meer; CLI bootstrap voor owner.
- Register blijft alleen workers.
- Admin-endpoints checken owner of dispatcher (server-side).
