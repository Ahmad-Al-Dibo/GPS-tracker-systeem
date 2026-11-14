# Plan 05 — Bronkeuze: App of Apparaat per voertuig

**Status:** actief
**Prioriteit:** HOOG — gebruiker moet zelf kiezen tussen app-GPS en hardware-GPS
**Datum:** 2026-11-05

## Probleem

De keuze tussen browser/app-GPS en FMC920-apparaat is weggevallen na de hardware-integratie. De gebruiker wil zelf kiezen welke bron per voertuig wordt gebruikt.

## Acties

1. [ ] `IngestSource`-model: `trackingSource`-veld toevoegen (`"app"` | `"device"` | `"both"`)
2. [ ] Voertuigformulier: bron-keuze-radioknoppen (📱 App / 📡 Apparaat / Beide)
3. [ ] Ingest-endpoint: alleen verwerken als bron overeenkomt met voertuig-keuze
4. [ ] App-GPS (browser-locatie delen) blijft beschikbaar als alternatief
5. [ ] UI: duidelijke indicatie welke bron actief is per voertuig

## Acceptatie

- Gebruiker kan per voertuig kiezen: app, apparaat, of beide
- App-GPS blijft werken (kaart-pagina "Deel mijn locatie")
- Device-GPS blijft werken (FMC920 → TCP → ingest)
- Beide bronnen tegelijk mogelijk als "both" gekozen
