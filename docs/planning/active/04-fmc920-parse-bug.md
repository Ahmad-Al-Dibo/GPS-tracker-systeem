# Plan 04 — FMC920 Parse-bug: Codec 8E IO-sectie corrigeren

**Status:** actief
**Prioriteit:** KRIITISCH — blokkeert alle GPS-locaties op de kaart
**Datum:** 2026-11-05

## Probleem

Het FMC920-apparaat heeft een geldige GPS-fix (52.161465, 6.7382983 — bij Haaksbergen, 14 satellieten, HDOP 0.71), maar de TCP-server ontvangt verkeerde coördinaten (2.2, 0.1 = Golf van Guinee) en corrupte timestamps (jaar 135763).

## Oorzaak (gevonden via hex-analyse)

De `parseIoSection()`-functie in `teltonika/server.mjs` berekent de `next`-offset van record 1 verkeerd. Daardoor beginnen alle volgende records in de batch op de verkeende bytepositie — vandaar verkeerde lat/lon en timestamps.

Bewijs:
- Record 1 (eerste in 1205-byte frame): timestamp correct (2026-11-04), lat=0/lon=0 (geen fix) — klopt
- Record 2+: timestamp jaartal 135763, lat=2.2/lon=0.1 — parse-fout
- E2E-test met handgebouwd frame: werkt correct (simpel IO-patroon)
- Configurator toont juiste positie: 52.161465, 6.7382983

## Acties

1. [ ] Hex-dump van een ECHT frame met bekende coördinaten verzamelen (uit server.log `ruwe data`)
2. [ ] Officiële Teltonika Codec 8E-documentatie vergelijken met huidige parser
3. [ ] `parseIoSection()` in `teltonika/server.mjs` corrigeren
4. [ ] Test met echt device-frame (bekende coördinaten → correcte parse)
5. [ ] E2E-test opnieuw draaien
6. [ ] Server herstarten en live verifiëren

## Acceptatie

- Device stuurt batch → server parse correcte lat/lon (52.x, 6.x)
- Voertuig-positie op kaart = Configurator-positie
- Timestamps zijn geldig (2026)
- E2E-test groen
