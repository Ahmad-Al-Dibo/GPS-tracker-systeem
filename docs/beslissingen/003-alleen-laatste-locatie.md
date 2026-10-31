# Beslissing 003 — Alleen laatste locatie per worker in MVP

**Datum:** 2026-10-10  
**Status:** vastgelegd  
**Context:** Admin-dashboard toont actuele positie. Volledige GPS-geschiedenis/routes zijn fase 6.

## Keuze

Eén rij per worker in `location_shares` (upsert). Geen `gps_points`-tabel in MVP v2.

## Gevolgen

- Klein, snel schema; geen groeiende tabel.
- Route-playback pas na fase 6 (nieuwe tabel + adapter).
- `location_updated_at` geeft de admin "laatste fix"-tijd.
