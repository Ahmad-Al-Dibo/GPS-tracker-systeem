# Beslissing 011 — Open ingest + publiek live-dashboard (simulatie)

**Datum:** 2026-10-12  
**Status:** vastgelegd  

## Context

De Android Location Agent stuurt locaties naar meerdere API’s met verschillende **namen**. De website moet die tonen zonder inloggen — als simulatie van echte GPS-trackers.

## Keuze

- `POST /api/ingest` — **publiek**, geen sessie; payload: `name`, `latitude`, `longitude`, …  
- `GET /api/ingest/sources` — laatste locatie per naam  
- `GET /live` — publiek dashboard met kaart + polling 5s  
- Login (`/track`, `/admin`, …) blijft beschikbaar voor het werknemers-/auth-gedeelte  

## Android-app

- Standaard payload bevat `name` = API-naam uit de app  
- Per API-config: URL `http://<pc-ip>:3000/api/ingest`  

## Gevolgen

- Simulatie zonder accounts; productie zou API-keys/rate-limits moeten toevoegen.  
- Meerdere trackers/apparaten via eigen `name`-waarde.  
