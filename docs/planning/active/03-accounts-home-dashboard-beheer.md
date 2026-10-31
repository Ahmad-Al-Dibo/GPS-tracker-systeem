# Plan — Account-systeem, home, instructies en locatiebeheer

**Status:** wacht op goedkeuring  
**Datum:** 2026-10-12  

## 1. Doel

Van open simulatie-dashboard naar een **multi-user GPS-platform**:

1. Registreren / inloggen per gebruiker  
2. Home-pagina met uitleg en app-download (QR)  
3. Dashboard per gebruiker (alleen eigen trackers)  
4. Locaties beheren: logo/icoon, beschrijving, verwijderen  
5. Alles in PostgreSQL  

## 2. Auth (hergebruik bestaand)

| Onderdeel | Keuze |
| --- | --- |
| Registratie | username + wachtwoord (bcrypt) — open voor iedereen |
| Inloggen | sessie-cookie (DB-sessie, beslissing 001) |
| Rollen | `user` (nieuw, standaard) · `admin` (via seed/CLI) |
| Ownership | elke `IngestSource` krijgt `owner_user_id` |

Bestaande `users`-tabel uitbreiden met rol `user`; geen apart systeem.

## 3. Datamodel-wijzigingen

```
users
  + role: user | admin | worker   (uitbreiding)

ingest_sources
  + owner_user_id (uuid → users)  -- wie beheert deze bron
  + description (text, nullable)
  + icon_url (text, nullable)     -- eigen logo/upload
  + icon_emoji (bestaat al)
  + display_name (bestaat al)
  + is_public (bool, default false) -- optioneel delen
```

Migratie + seed: bestaande bronnen krijgen eigenaar `admin` of blijven orphan (tijdelijk zichtbaar voor admin).

## 4. API

| Methode | Pad | Toegang | Doel |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | publiek | account aanmaken |
| POST | `/api/auth/login` | publiek | inloggen |
| POST | `/api/auth/logout` | sessie | uitloggen |
| GET | `/api/me` | sessie | profiel |
| GET | `/api/ingest` | sessie | eigen trackers |
| POST | `/api/ingest` | sessie | locatie sturen (met name) |
| PATCH | `/api/ingest/sources/[name]` | eigenaar | icoon/beschrijving |
| DELETE | `/api/ingest/sources/[name]` | eigenaar | verwijderen |
| GET | `/api/ingest/sources` | admin | alle (of alleen eigen) |

**Belangrijk:** `/api/ingest` wordt **niet meer publiek** — vereist sessie of API-key.  
Android-app krijgt optioneel `X-Api-Key` of blijft werken met sessie-token in header.

## 5. Pagina’s

| Pad | Inhoud |
| --- | --- |
| `/` | Home: intro, screenshots, “Download app” + QR |
| `/register` | Registreren |
| `/login` | Inloggen |
| `/dashboard` | Kaart + eigen locaties + beheer |
| `/setup` | Installatiegids: app-download, QR, eerste stappen |

### Home (`/`)
- Hero: wat doet het platform  
- 3 stappen: 1) Account 2) App installeren 3) Delen  
- **QR-code** die wijst naar APK of download-pagina  
- Knop: “Account maken” → `/register`  
- Screenshots (placeholder tot echte plaatjes)  

### Dashboard (`/dashboard`)
- Kaart met eigen locaties (hergebruik `TrackingMap`)  
- Lijst: icoon, naam, snelheid, status  
- Per locatie: **Bewerken** (icoon/logo, beschrijving) · **Verwijderen**  
- Instellingen: kaartstijl, namen tonen  
- “App downloaden” knop → `/setup`  

### Setup-gids (`/setup`)
- Stap-voor-stap: APK downloaden (QR/link)  
- Instellen: URL van server, frequentie  
- Testen: eerste locatie zien op dashboard  
- Desktop-versie: link naar web-dashboard (dezelfde URL)  

## 6. QR-code

- Genereer QR die naar de APK-download-URL of `/setup` wijst  
- Server-side: `qrcode` npm-package, of client-side canvas  
- Toon op home en setup-pagina  

## 7. Android-app

- Na registratie: gebruiker vult server-URL + eventueel API-token  
- App werkt zoals nu, maar met sessie of API-key i.p.v. open ingest  
- Upload-functie voor eigen logo later (fase 2)  

## 8. Screenshots / instructies

- Fase 1: textuele stappen + placeholders  
- Fase 2: echte screenshots van app + dashboard in `/setup`  

## 9. Fasen

| Fase | Werk | Afhankelijk van |
| --- | --- | --- |
| **A** | Ownership op IngestSource + auth op ingest-endpoints | niets |
| **B** | Home + register/login-flow + dashboard per gebruiker | A |
| **C** | Locatiebeheer: beschrijving, logo/icoon, verwijderen | B |
| **D** | Setup-pagina + QR-code + instructies | B |
| **E** | Android: token/URL-config en eventueel logo-upload | A–D |

## 10. Openstaande vragen

1. **API-key vs sessie voor app?**  
   - A: API-key per gebruiker (app stuurt header, geen browser-sessie)  
   - B: App gebruikt username/wachtwoord en haalt sessie-token op  

2. **Logo-upload?**  
   - Alleen emoji/icoon (nu)  
   - Of bestandsupload (PNG/SVG) met opslag in DB of `/public`  

3. **Bestaande data?**  
   - Huidige bronnen toewijzen aan admin  
   - Of reset (schoon begin)  

4. **Google Play later** — APK via directe download is MVP; Play Store-ready packaging later  

## 11. Definition of Done

1. Nieuwe gebruiker registreert → ziet eigen dashboard  
2. Ingest-endpoint weigert onbevoegde posts  
3. Gebruiker kan icoon + beschrijving per locatie wijzigen  
4. Gebruiker kan locatie verwijderen  
5. Home + setup-pagina leggen installatie uit (met QR)  
6. Alles in DB (users, sources, settings)  
7. Typecheck + build + smoke-test OK  
