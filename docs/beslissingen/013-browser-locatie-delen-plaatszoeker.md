# Beslissing 013 — Browser-locatie delen + plaatszoeker op de kaart

**Datum:** 2026-10-18
**Status:** vastgelegd

## Context

Gebruikers willen op de kaart (1) hun **eigen huidige locatie** zien en
daarnaartoe kunnen, (2) **plaatsen zoeken** (straatnaam, plaats, postcode,
coördinaten) en ernaartoe vliegen, en (3) hun locatie vanuit de browser
**delen** met de rest van de vloot — zonder de Android-app.

## Keuze

### Plaatszoeker + "Mijn locatie" (in elke kaart)

- Zoekbalk linksboven in `TrackingMap` (beschikbaar op dashboard, Kaart en
  Historie): zoekt via **Photon** (`photon.komoot.io`) — OSM-geocoding zonder
  API-key, resultaten in het Nederlands, gedebounced (450 ms), min. 3 tekens.
- Ondersteunt ook **coördinaten** (`52.19, 6.69` → navigeren).
- Kiezen uit de resultatenlijst → vliegt naar de locatie en zet een 📌-marker
  met adres-popup.
- **🎯 Mijn locatie**-knop (rechts): browser-GPS (`navigator.geolocation`) →
  blauwe stip + nauwkeurigheids-cirkel + flyTo. Toestemming alleen bij klik.
- Alle externe kaartweergave blijft **OpenStreetMap-tiles** (geen API-key).

### Locatie delen (Kaart-pagina)

- Knop **📡 Deel mijn locatie** / **■ Stop delen** in de kaart-header.
- De browser volgt je positie (`watchPosition`, high accuracy) en stuurt die
  naar `POST /api/ingest` als een tracker met naam `browser-<username>` →
  verschijnt live op de kaart voor iedereen (ook de Android-app-voertuigen).
- Auth via API-key: eerste keer wordt er automatisch een key
  ("Browser-locatie (kaart)") aangemaakt en in `localStorage` bewaard
  (`gps_browser_share_key`); daarna hergebruikt.
- Statusregel toont laatste verzending/fouten; delen stopt bij verlaten pagina
  (clearWatch) — de laatste positie blijft staan als gewoon voertuig-record
  (verwijderen via Voertuigen-pagina of Prullenbak).

## Gevolgen

- Locatie delen = openbaar binnen de vloot (iedereen met toegang ziet de
  browser-tracker); key in localStorage geldt als device-credential.
- Photon is een publieke service (liefst licht gebruiken); geen API-kosten.
- HTTPS is verplicht voor geolocation (tunnel + localhost voldoen).

## Tests

- Typecheck/lint/build geslaagd; `/app/map` 200 met sessie;
  Photon geocoding geverifieerd (Haaksbergen gevonden).
