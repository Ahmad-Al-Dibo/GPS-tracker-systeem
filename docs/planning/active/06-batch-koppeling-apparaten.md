# Plan 06 — Batch-koppeling 60+ apparaten

**Status:** actief
**Prioriteit:** HOOG — schaalbaarheid naar 60+ FMC920-apparaten
**Datum:** 2026-11-05

## Probleem

Apparaten worden nu één-voor-één gekoppeld via de UI. Bij 60+ apparaten is dit niet schaalbaar.

## Acties

1. [ ] CSV-import voor apparaten: `imei,voertuignaam,kenteken` (één regel per apparaat)
2. [ ] Batch-API-endpoint: `POST /api/devices/batch` (max 200 per verzoek)
3. [ ] UI: import-tab op `/app/devices` met preview + samenvatting
4. [ ] Automatische voertuig-aanmaken als voertuignaam nog niet bestaat (optie)
5. [ ] Dedupe: IMEI die al geregistreerd is → overslaan + rapporteren
6. [ ] Download-voorbeeld-CSV-knop

## Acceptatie

- CSV met 60+ IMEI's importeren in één verzoek
- Preview toont wat wordt aangemaakt vs. overslagen
- Samenvatting: X nieuw, Y al bestaan, Z fouten
- Bestaande koppelingen onaangetast
