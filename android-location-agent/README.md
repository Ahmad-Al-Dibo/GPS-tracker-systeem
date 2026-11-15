# Location Agent (Android / Kotlin)

Mobiele GPS-tracker-app voor het **GPS Tracking Platform** — met
configurabele eigen API's (experimenteel) én het platform-contract
(Phase 2: automatische tracker-registratie).

## Functies

**Platform-tracking (Phase 2 — tab Tracker)**
- Permanente **install-ID** (één keer gegenereerd, overleeft app-herstarts)
- **Registratie/ provisioning**: server-URL + API-key → `POST /api/trackers/enroll`
  → tracker wordt automatisch aangemaakt (unverified) + unieke **tracker-key**
- **Tracker-naam + metadata** (kenteken, voertuigtype, bestuurder, bedrijf,
  afdeling + eigen key-value velden) — wijzigingen worden alleen gesynchroniseerd
  als ze veranderd zijn
- **Echte GPS-zending**: lat/lon, tijdstempel, snelheid, hoogte, koers,
  nauwkeurigheid, batterij (%) → `POST /api/ingest` met `X-Tracker-Key`
- **Offline-wachtrij** (Room): bij netwerkfout gebufferd (max 500), na
  herverbinding automatisch gesynchroniseerd (oudste eerst)
- Live status: GPS-fix, accu, laatste verzending, aantal gebufferde punten

**Overig**
- Configurabele eigen API's (URL/headers/body-template) — behouden
- Foreground-service + Fused Location, achtergrond-permissie-aanvraag
- Statusscherm (aan/uit, interval) en Terminal (HTTP-log)

## Bouwen (APK)

```powershell
cd android-location-agent
.\gradlew.bat assembleDebug
# APK: app\build\outputs\apk\debug\app-debug.apk
Copy-Item app\build\outputs\apk\debug\app-debug.apk ..\public\downloads\gps-tracker.apk
```

De website toont de downloadlink zolang `appDownloadUrl` in **Instellingen**
staat (bijv. `/downloads/gps-tracker.apk`). Bij een release-build:
`.\gradlew.bat assembleRelease` + tekeningsconfiguratie (debug-getekende APK
is geschikt voor intern gebruik, niet voor de Play Store).

Min SDK 26 · Target 35 · Kotlin 2.0 · Compose · Room · OkHttp

## Gebruik (platform)

1. Permissies toestaan: locatie (+ notificaties op Android 13+; optioneel
   achtergrond-locatie voor continue tracking — knop op tab Tracker).
2. Tab **Tracker** → server-URL van het platform + je **API-key**
   (dashboard → API Keys) → **Registreren**.
3. Tracker-naam en metadata invullen → **Opslaan & syncen**.
4. **START tracking** — de tracker verschijnt automatisch op het dashboard
   (status: *Ongeverifieerd*); een beheerder verifieert hem.
5. Tab **Terminal** toont verzendingen/fouten; status toont laatste zending
   en gebufferde (offline) punten.

## Authentificatie uitgelegd

- De **install-ID** identificeert de installatie (nooit de naam).
- De **API-key** van de gebruiker is nodig om te registreren (en claimt
  eigenaarschap); een gestolen install-ID alleen is niet genoeg.
- Na registratie authenticeert de **tracker-key** (`gptt_…`, 1× zichtbaar)
- elke GPS-zending; de server kent alleen de hash.

## Oude functionaliteit (behouden)

Tab **API's** configureert externe endpoints met body-template placeholders
`{latitude}` `{longitude}` `{accuracy}` `{sampledAt}` `{receivedAt}`
(standaard JSON-payload bij lege template). Zie de git-history voor het
oorspronkelijke README-deel.
