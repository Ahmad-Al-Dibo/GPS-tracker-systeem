# Beslissing 010 — Android Location Agent (Kotlin) als aparte bron-app

**Datum:** 2026-10-11  
**Status:** vastgelegd  

## Context

Naast de browser-webdemo wil de gebruiker een **native Android-app** (Kotlin) die:

- meerdere API’s kan beheren (CRUD + aan/uit)
- verzendfrequentie instelbaar is (5s – 1 maand)
- een terminal toont voor API-responses en fouten
- locatie deelt via een foreground-service

## Keuze

Apart project in `android-location-agent/` (niet in de Next.js-app).  
Stack: Kotlin · Jetpack Compose · Room · OkHttp · FusedLocationProvider · foreground service `location`.

## Gevolgen

- App is een **multi-API sender**: elke ingeschakelde API krijgt hetzelfde GPS-event.
- Logs lokaal in Room (laatste 500 regels), zichtbaar in Terminal-tab.
- Interval client-side; server kan altijd eigen rate-limits houden.
- Integratie met webplatform via body-template of toekomstige adapter-endpoint.
