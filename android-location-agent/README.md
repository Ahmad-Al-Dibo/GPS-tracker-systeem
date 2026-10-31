# Location Agent (Android / Kotlin)

Mobiele app die locatie deelt naar **eigen, configureerbare API’s**.

## Functies

- API’s **toevoegen / bewerken / verwijderen / aan-uit**
- Per API: naam, URL, methode (POST/PUT/PATCH), headers, body-template
- Verzendfrequentie: **5 seconden tot 1 maand** (presets + eigen waarde)
- **Statusscherm**: delen aan/uit, interval
- **Terminal**: live log van HTTP-verzoeken, responses en fouten
- Foreground-service + Fused Location

## Bouwen

Open de map `android-location-agent` in **Android Studio** (of `gradlew assembleDebug` met Android SDK).

```bash
cd android-location-agent
./gradlew assembleDebug
# APK: app/build/outputs/apk/debug/app-debug.apk
```

Min SDK 26 · Target 35 · Kotlin 2.0 · Compose · Room · OkHttp

## Gebruik

1. Permissies: locatie (+ notificaties op Android 13+)
2. Tab **API’s** → + API → URL van je backend (bijv. `https://…/api/tracking/locations`)
3. Optioneel headers (bv. `Authorization: Bearer …`) en body-template
4. Tab **Status** → frequentie kiezen → **START delen**
5. Tab **Terminal** → requests/responses/fouten

## Body-template placeholders

`{latitude}` `{longitude}` `{accuracy}` `{sampledAt}` `{receivedAt}`

Lege template = standaard JSON:

```json
{
  "latitude": …,
  "longitude": …,
  "accuracyMeters": …,
  "sampledAt": …,
  "receivedAt": …,
  "event_id": "uuid",
  "source": "android_location_agent"
}
```

## Koppelen met GPS Tracking Platform (web)

Gebruik een adapter-endpoint dat dit payload-formaat accepteert, of pas de body-template aan naar het contract van je backend (`latitude`, `longitude`, `sampled_at`, …).
