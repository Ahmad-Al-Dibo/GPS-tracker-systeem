# Plan 04 — FMC920 Parse-bug: Codec 8E IO-sectie corrigeren

**Status:** afgerond (fixture-artefact — parser zelf OK; live-verificatie nog open)
**Prioriteit:** KRIITISCH → OPGELOST (2026-11-14)
**Datum:** 2026-11-05

## Probleem (oorspronkelijke melding)

Het FMC920-apparaat leek verkeerde coördinaten (2.2, 0.1 = Golf van Guinee)
en corrupte timestamps (jaar 135763) te leveren via de TCP-server.

## Oorzaak (vastgesteld 2026-11-14)

**Geen parser-defect — het test-fixture was corrupt.** De hex-dump in
`teltonika/selftest.mjs` (en `analyze-frame.mjs`) was 2409 tekens (oneven)
i.p.v. 2410: er miste precies 1 hex-teken in de nul-run van record 9.
Daardoor schoof alle byte-uitlijning na die positie op en ontstonden de
absurde jaartallen/coordinaat-waarden — exact de symptomen uit deze melding.

Bewijs:

- Herstel door 1 hex-teken `0` in te voegen op index 1396 → **crc16-IBM
  matcht**, alle 14 records parse exact (eind-offset 1192, trailer 14),
  timestamps 2026-11-04 15:28..15:57Z (GNSS-fix was afwezig in deze
  capture → lat/lon 0.0 is de echte waarde van dit frame).
- `node teltonika/selftest.mjs` tegen een live lokale server: **alle 4 de
  stappen PASS, incl. "ACK echte chunk = 14 records"**.
- De synthetische codec-8/8E-frames in de selftest parse'ten al correct —
  de dynamische recordgrens-berekening van `parseIoSection()` werkt.

Ook gecorrigeerd: `selftest.mjs` gebruikte CRC-16/CCITT (0x1021) voor
zelf-gebouwde frames terwijl device én server CRC-16/IBM (0xA001, Teltonika-
spec) gebruiken — nu identiek.

## Acties

- [x] Hex-fixture hersteld in `teltonika/selftest.mjs` (index 1396, 2410 tekens)
- [x] Zelfde fixture hersteld in `teltonika/analyze-frame.mjs`
- [x] `crc16()` in selftest → CRC-16/IBM (gelijk aan server.mjs/device)
- [x] Selftest groen: ACK 14 op echte chunk
- [x] Plan bijgewerkt met conclusie

## Nog open (echte hardware)

- [ ] Live capture met `GPS_LOG_RAW=1` van een nieuw frame om de codec-8E
      IO-layout definitief te bevestigen (deze fixture had geen GPS-fix).
- [ ] Server draaien met echt apparaat → positie op kaart verifiëren
      (RP001 "laatste 20%").

## Acceptatie (afgevinkt)

- [x] Device-frame parse correcte timestamps (2026)
- [x] E2E-test (selftest) groen inclusief echte chunk
- [x] Correlatie met Configurator-fix afgehandeld: geen parser-fout
