# Plan 07 — Live locatie-updates (WebSocket/SSE)

**Status:** actief
**Prioriteit:** MIDDEN — gebruiker moet locatie-wijzigingen direct zien
**Datum:** 2026-11-05

## Probleem

Locaties worden nu gepollt (5-10s). De gebruiker wil zien dat een locatie verandert en hoe lang geleden een update is verstuurd (N seconden geleden).

## Acties

1. [ ] Server-Sent Events (SSE) endpoint: `/api/stream` — stuurt bij elke ingest-update
2. [ ] Frontend: EventSource-verbinding op kaart/dashboard-pagina's
3. [ ] "Laatst gezien X seconden geleden" per voertuig/apparaat in de UI
4. [ ] Animatie/visuele indicator bij nieuwe positie (puls-marker)
5. [ ] Fallback: polling blijft werken als SSE niet beschikbaar
6. [ ] Rate-limit: max 1 update per seconde per client

## Acceptatie

- Nieuwe GPS-positie verschijnt binnen 1s op de kaart (geen poll-wachttijd)
- "Laatst gezien 5s geleden" telt live op
- Oudere browsers zonder SSE vallen terug op polling
- Geen performance-problemen bij 60+ apparaten
