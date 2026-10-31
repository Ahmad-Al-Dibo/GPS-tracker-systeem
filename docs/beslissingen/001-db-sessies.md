# Beslissing 001 — Database-sessies i.p.v. JWT-only

**Datum:** 2026-10-10  
**Status:** vastgelegd  
**Context:** MVP v2 heeft `last_heartbeat_at`, `expires_at` en `revoked_at` per sessie nodig om `online`/`offline`/`logged_out` te berekenen.

## Opties

| Optie | Plus | Min |
| --- | --- | --- |
| A. JWT-only (stateless) | Snel, geen DB-read per request | Logout/heartbeat moeilijk; status niet server-side bij te houden |
| B. DB-sessie + cookie | Heartbeat, expiry, revoke centraal; status altijd actueel | DB-read per request (acceptabel voor MVP) |
| C. JWT + aparte presence-tabel | Mix | Twee bronnen van waarheid; complexer |

## Keuze

**B. DB-sessie + httpOnly cookie** met `session_id`.  
Elke request die geauthenticeerd moet zijn leest de sessie uit de DB. Heartbeat en logout updaten diezelfde rij.

## Gevolgen

- `sessions`-tabel is verplicht (zie schema).
- Proxy/middleware leest sessie-cookie en laadt sessie + user.
- Later kan JWT-cache of Redis pas als schaal een issue wordt.
