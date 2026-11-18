# RP003 — Technical Report: wat werkt, wat beter kan, en antwoorden op kernvragen

**Status:** Afgerond — Phase 1 (codebase/refactor) + Phase 2 (unified trackers) uitgevoerd en getest
**Prioriteit:** Informatief — beslisdocument voor niet-technische belanghebbenden
**Datum:** 2026-11-15

---

## 1. Wat werkt goed (geverifieerd met tests)

- **Automatische tracker-registratie**: een nieuwe FMC920 (IMEI) én een nieuwe
  telefoon-app registreren zichzelf bij de eerste data — geen handmatige aanmaak
  meer nodig. Getest: 34 scenario-checks + 15 browser-checks, allemaal groen.
- **Eén systeem voor beide bronnen**: hardware en mobiel delen hetzelfde
  tracker-model, dezelfde Trackers-pagina en dezelfde kaart/dashboard.
- **Volledige test-suite groen**: 34 + 15 + 19 + 11 + 72 + 59 + 28 checks,
  GPS-pijplijn-selftest 4/4 (ACK 14 op echte FMC920-chunk), productie-build OK.
- **Dashboard & Trackers-pagina**: zoeken en filteren (naam, IMEI/install-ID,
  kenteken, bestuurder, bron, status), detailpaneel (positie, batterij,
  GPS-history, metadata, verificatie), werkend op telefoon, tablet en desktop.
- **Mobiele app**: echte APK gebouwd en vanaf de website downloadbaar; naam en
  metadata instellen, tracking aan/uit, offline-bufferring aan boord.
- **Metadata-wijzigingen** synchroniseren zonder beheerdersgegevens te
  overschrijven (scenario D getest: admin-velden blijven behouden).
- **Klaar voor productie-structuur**: additieve database-migraties met backfill
  (geen data verloren), geen secrets in git, logging en audit-trail aanwezig.

---

## 2. Wat beter kan

- **Echte-hardware-tests ontbreken nog.** Alles wat getest is, is met nagemaakte
  data. De echte FMC920, een echte telefoon en het gedrag na internetverlies
  moeten op locatie worden getest (zie §6).
- **Beveiliging van het hardware-pad is beperkt door het protocol.** Teltonika
  AVL stuurt alleen een IMEI, geen wachtwoord. Gedaan als mitigering:
  tunnel-beveiliging + gedeelde sleutel op de HTTP-hop + admin-verificatie per
  IMEI + intrekken. Voor extra zekerheid: TLS op poort 5556 of een privé-APN
  (staat al genoteerd als release-blocker in `DEPLOYMENT.md`).
- **APK is "debug" getekend** — prima voor intern gebruik, niet voor de Play
  Store (release-signing is een aparte workflow-stap).
- **Rate-limits zijn in-memory** (reset bij serverherstart); in productie
  nginx `limit_req` eroverheen zetten.
- Sommige pagina's (Instellingen, Rapporten) zijn nog formulier-gedicht;
  animaties bewust minimaal gehouden — mag in een volgende fase mooier.
- Geen 2FA, geen CI-pipeline, geen volledige CSP (bewust uitgesteld).

---

## 3. Is dit geschikt om aan een niet-technisch bedrijf te geven?

**Ja, voor het dagelijks gebruik.** Het proces voor een niet-technische gebruiker:

| Rol | Wat moet hij doen? |
|---|---|
| **Telefoon als tracker** | App installeren → tab *Tracker* → API-key plakken → naam invullen → **Registreren** → **START tracking**. Klaar. |
| **FMC920** | Eénmalig in het apparaat de server-URL/poort instellen (handleiding staat in de Trackers-pagina). Daarna **automatisch** zichtbaar. |
| **Beheerder** | Trackers-pagina openen → nieuwe tracker staat er al → **Verifiëren** klaar. |

- Geen handmatige tracker-aanmaak, geen database, geen code.
- Alles in het Nederlands; kleuren (groen/oranje/grijs) duiden de status; de
  installatiehandleiding en het app-installatiepaneel staan in het platform
  zelf; de APK-downloadlink is in de Trackers-pagina ingebouwd.
- **Eerlijke grens**: het is een professioneel werkend platform, geen
  "SaaS met onboarding-wizard". Voor een demo aan een klant: 5 minuten
  voorbereiding (ingelogd, één tracker geverifieerd) en het overzicht is sterk.
  Rapportages en instellingen vragen even uitleg — dat is normaal voor
  fleet-management-software.

---

## 4. FMC920 ingesteld met hostname + poort → verschijnt die automatisch?

**Ja — als de drie server-lagen draaien.** De keten:

```
FMC920 (hostname:port ingesteld)
  → TCP-tunnel (poort 5556)
  → teltonika/server.mjs (decodering)
  → auto-registratie op IMEI
  → dashboard + kaart
```

Vereisten:

1. **Web-app draait** (`npm start` / systemd `gps-web`) met dezelfde
   `TELTONIKA_INGEST_KEY` als de TCP-service.
2. **TCP-service draait** (`gps-tcp` / `node teltonika/server.mjs`).
3. **Tunnel / poort 5556** bereikbaar vanaf het apparaat (bore.pub, of
   nginx-stream op de VPS), firewall open.
4. Het apparaat heeft een **data-abonnement (APN)** en stuurt volgens zijn eigen
   interval — de eerste punten kunnen enkele minuten (of langer) duren; met SMS
   `  getrecord` (twee spaties vooraf) forceer je direct een verzending.

Zodra dat klopt: het apparaat verschijnt **automatisch** als tracker
(*Ongeverifieerd*), krijgt zijn eerste positie en staat op dashboard én kaart.
Je hoeft **niets** aan te maken. Lokale controle: `node teltonika/selftest.mjs`
(toont of de TCP-kant leeft).

---

## 5. Kan ik de telefoon-GPS ook in de app gebruiken?

**Ja — dat is precies wat de app doet.** Tab *Tracker*:

- gebruikt de echte GPS van de telefoon (voor- én achtergrond, mits toegestaan);
- verstuurt lat/lon, snelheid, hoogte, koers, nauwkeurigheid en **batterij-%**;
- toont live: huidige coördinaten, laatste verzending, aantal
  offline-gebufferde punten;
- bij geen internet: punten worden lokaal bewaard (Room-wachtrij, max 500) en
  na herverbinding automatisch gesynchroniseerd (oudste eerst);
- Android beperkt achtergrond-tracking soms (batterij-optimalisatie) — de app
  meldt dit en heeft een knop om de achtergrond-toegang aan te vragen.
  **Eerlijk**: continu doorlopend tracken is afhankelijk van de
  OS-instellingen; dat is een Android-regel, geen app-fout.

---

## 6. Is de beveiliging hoog genoeg?

**Voor een bedrijfsinterne/afgeschermde inzet: ja, met een sterke basis.**

Aanwezig:

- Wachtwoorden gehasht (bcrypt); sessies server-side met httpOnly-cookies;
  API-keys en tracker-keys alleen als SHA-256-hash opgeslagen (raw één keer
  getoond).
- Login rate-limit + audit-log; enrolment-rate-limit; nieuwe-IMEI-aanmaak
  gelimiteerd (tegen spam via de publieke poort).
- Trackers authenticeren met een geheime **tracker-key** — een gestolen
  install-ID alleen kan géén data sturen (test B12: 401).
- Admin-verificatie + intrekken per tracker; eigenaar/admin-rechten op elke
  tracker-route (de IDOR-gaten uit Phase 1 zijn gedicht); Zod-validatie op alle
  invoer; geen secrets in git; proxy is default-deny voor /api/*.
- Multi-tenant-vorm (eigenaar per tracker) ligt erin — geschikt om later uit
  te breiden naar meerdere bedrijven.

**Kanttekeningen (bewust en gedocumenteerd):**

1. **Hardware-authenticatie is IMEI-gebaseerd** (protocol-limitatie van
   Teltonika: AVL kent geen device-geheim). Beveiligd via: beheerlijke
   tunnel + gedeelde sleutel op de HTTP-hop + admin-pairing per IMEI +
   intrekken. Wie de fysieke IMEI kónt én de tunnel bereikt, kan vóór
   verificatie data sturen; na intrekken niet meer. Dichten: TLS op 5556 of
   privé-APN (al genoteerd als release-blocker).
2. Productie **moet** achter HTTPS draaien; externe rate-limit (nginx
   `limit_req`) aanbevolen; geen 2FA.
3. APK is intern gedistribueerd (van eigen domein), niet publiek getekend.

**Conclusie:** genoeg voor een bedrijf dat zijn eigen vloot trackt, zolang de
productie-stappen (HTTPS, tunnel-TLS, backups — zie `DEPLOYMENT.md`) gevolgd
worden. Voor openbare multi-klant-SaaS zou ik eerst 2FA, externe rate-limits en
per-device-credentials toevoegen.

---

## 7. Testresultaten (laatste volledige run, 2026-11-15)

| Suite | Resultaat |
|---|---|
| typecheck / lint / build (49 routes) | ✅ |
| Tracker-scenario's A/B/C/D/F (API, nieuw) | ✅ 34/34 |
| Trackers-UI Playwright (nieuw) | ✅ 15/15 |
| Map-smoke Playwright | ✅ 19/19 |
| e2e / trash / locations / jobs | ✅ 11 · 72 · 59 · 28 |
| dedupe / ingest-edge | ✅ |
| Teltonika TCP-selftest | ✅ 4/4 (ACK 14) |
| Android `assembleDebug` | ✅ BUILD SUCCESSFUL |

**Nog te verifiëren op echt materiaal:** live FMC920 → tunnel → kaart; APK op
een telefoon (enroll, achtergrond, offline-herstel); TLS op 5556; download via
het productiedomein.

---

**Gerelateerd:** RP001 (FMC920 lokaal), RP002 (technisch/financieel),
`docs/planning/active/08-phase1-codebase-audit-cleanup.md`,
`docs/planning/active/09-phase2-unified-trackers.md`
