# Beslissing 006 — Volgen van het officiële technisch ontwerp (v3)

**Datum:** 2026-10-11  
**Status:** vastgelegd  
**Bron:** `docs/GPS_Tracking_Platform_Technisch_Ontwerp_Testplan.docx` (v1.0, 11-10-2026)

## Context

MVP v2 (heartbeat + laatste locatie) werkt, maar het ontwerpdocument schrijft een rijker model voor: organisaties, owner/dispatcher/worker, tracking_sessions, location_points + latest_locations, instellingen (N), audit, historie en een volledig testplan (P0/P1).

## Keuze

Dit document is de **leidende specificatie** voor de volgende implementatie. Huidige code is een basis die wordt uitgebreid (niet alles opnieuw geschreven waar het al klopt: auth-sessies, heartbeat, status-dimensies, Leaflet).

## Gevolgen

- Nieuwe tabellen en rollen volgens §4 van het ontwerp.
- Acceptatiegrenzen en P0-tests uit §8–§9 als release gates.
- 24/7 background blijft buiten browser-MVP (kernbesluit document).
