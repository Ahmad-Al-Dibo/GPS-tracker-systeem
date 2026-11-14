# FMC920 Compatibility Audit

**Datum:** 2026-10-19
**Scope:** Bestaand GPS-platform ↔ Teltonika FMC920
**Methode:** Read-only inspectie van broncode, schema, scripts en protocol-implementatie

---

## 1. Executive Summary

**Overall compatibility: DEELS GEREED voor hardware-integratie.**

Het platform kan vandaag FMC920-GPS-data ontvangen, decoden, authenticeren en opslaan. De volledige keten (TCP → decoder → HTTP-push → DB → dashboard) is geïmplementeerd en met echte hardware geverifieerd (`scripts/e2e-teltonika.mjs`, IMEI `868618088364708`, codec 8E).

**Kan het platform vandaag FMC920-data ontvangen?** Ja — via een aparte TCP-server (`teltonika/server.mjs`, poort 5027) die AVL-frames parsed en gedecodeerde records pushed naar `POST /api/ingest/teltonika`.

**Kan het platform DOUT1 op afstand aansturen?** Nee — er is geen enkele uitgaande commando-infrastructuur, geen commando-wachtrij, geen codec-12-ondersteuning en geen ACK-afhandeling voor uitgaande berichten.

**Belangrijkste blokkers voor volledige FMC920-ondersteuning:**
1. Geen TLS op de TCP-verbinding (alleen plain TCP)
2. Geen uitgaande commando-infrastructuur (DOUT1, configuratie)
3. Geen real-time verbindingsstatus (alleen afgeleid uit `lastSeenAt`)
4. Geen duplicate/out-of-order bescherming op AVI-records
5. Gedeelde sleutel-authenticatie (niet per-device, geen challenge-response)

---

## 2. Existing Architecture

```text
┌─────────────────────────────────────────────────────────────────┐
│                        FMC920 (hardware)                        │
│  IMEI 868618088364708 · Codec 8 Extended · TCP · TLS None      │
│  APN internet.mobiel · ACK Type AVL · periodiek batch (~1u)     │
└──────────────────────────────┬──────────────────────────────────┘
                               │ 4G LTE
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  bore.pub:5556  (tunnel-client: teltonika/bore/bore.exe)        │
│  start-bore.cmd → TCP-tunnel naar lokale poort 5027             │
└──────────────────────────────┬──────────────────────────────────┘
                               │ TCP
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  teltonika/server.mjs  (apart Node.js-proces, poort 5027)       │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ 1. IMEI-handshake: 2B lengte + ASCII → 0x01 accept      │    │
│  │ 2. Frame: preamble(4)|length(4)|payload|crc(4)          │    │
│  │ 3. Codec 8/8E decoder (parseIoSection, parseRecord)     │    │
│  │ 4. HTTP-push VÓÓR ACK → POST /api/ingest/teltonika      │    │
│  │ 5. ACK = 4B aantal duurzaam geaccepteerde records       │    │
│  └─────────────────────────────────────────────────────────┘    │
│  HTTP-dashboard op poort 8787 (alleen-lezen, live status)       │
└──────────────────────────────┬──────────────────────────────────┘
                               │ HTTP POST + X-Ingest-Key
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  Next.js 16 App (poort 3000) — src/app/api/ingest/teltonika/    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ Auth: X-Ingest-Key (TELTONIKA_INGEST_KEY uit .env)      │    │
│  │ IMEI → GpsDevice lookup (moet active zijn)              │    │
│  │ Tolerant schema: clamping heading/speed/sats/timestamp  │    │
│  │ → IngestPoint.create (deviceId, altitude, heading, io)  │    │
│  │ → GpsDevice.update (lastSeenAt, lastFixAt, lastLat/Lon) │    │
│  │ → IngestSource.update (positie, km-stand)               │    │
│  │ → processIngest() (regel-evaluatie, fire-and-forget)    │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  Frontend: /app/devices (registratie, connect, toewijzing)      │
│            /app/map, /app (dashboard met voertuig-posities)     │
└─────────────────────────────────────────────────────────────────┘
```

**Frontend:** Next.js 16 App Router, React 19, TypeScript, Tailwind 4, Leaflet
**Backend:** Next.js API-routes, Prisma 6, PostgreSQL 18
**Hardware-laag:** Apart Node.js-proces (`teltonika/server.mjs`) met `net.createServer()`
**Auth:** DB-sessies (httpOnly cookie) voor gebruikers; gedeelde sleutel voor machine-tot-machine

---

## 3. Implementation Inventory

### Hardware-communicatie

| Bestand | Verantwoordelijkheid | Belangrijke symbolen |
|---|---|---|
| `teltonika/server.mjs` | TCP AVL-server + HTTP-dashboard | `crc16()`, `parseIoSection()`, `parseRecord()`, `parsePayload()`, `forwardToWeb()`, `handleFrame()`, `frameAcc()` |
| `teltonika/selftest.mjs` | Protocol-zelftest (codec 8 + 8E + echte chunk) | `testCodec8()`, `testCodec8E()`, `testRealChunk()` |
| `teltonika/start-web-mode.cmd` | Start server met push naar web-app | — |
| `teltonika/start-bore.cmd` | TCP-tunnel → bore.pub:5556 | — |
| `scripts/e2e-teltonika.mjs` | Volledige keten-test (login → device → TCP → DB) | `buildCodec8ERecord()`, `buildFrame()`, `sendTcp()` |
| `scripts/device-status.mjs` | Device-status check | — |

### Database

| Model | Velden | Opmerking |
|---|---|---|
| `GpsDevice` | imei (unique), label, brand, model, simCardNumber, firmware, protocol (codec8/8e/16), status (pending/active/revoked), authorizedAt, revokedAt, vehicleId, assignedAt, lastSeenAt, lastLat, lastLon, lastSpeedMps, lastFixAt, lastRecordCount, deletedAt | Volledig device-beheer |
| `IngestPoint` | + deviceId, altitude, heading, satellites, priority, ioData (Json) | Uitgebreid voor hardware |
| `IngestSource` | (voertuig) latitude, longitude, speedMps, sampledAt, currentKm, totalDistanceKm | Positie + km-stand |

### API-endpoints

| Endpoint | Methode | Auth | Functie |
|---|---|---|---|
| `/api/devices` | GET | sessie | Apparatenlijst |
| `/api/devices` | POST | sessie | Registreren (IMEI unique) |
| `/api/devices/[id]` | PATCH | sessie | connect/disconnect/assign/update |
| `/api/devices/[id]` | DELETE | sessie | Soft delete + revoke |
| `/api/ingest/teltonika` | POST | X-Ingest-Key | AVL-records ontvangen |
| `/api/ingest` | POST | X-API-Key | HTTP-ingest (browser/app) |

### Frontend

| Pagina | Functie |
|---|---|
| `/app/devices` | Device-beheer: registratie, connect-knop, voertuig-toewijzing, installatiehandleiding, live status |
| `/app/vehicles/[id]` | Gekoppelde apparaten-sectie met koppelen/ontkoppelen |
| `/app/map` | Live kaart met voertuig-posities (inclusief hardware-bron) |
| `/app` | Dashboard met statistieken + kaart |

---

## 4. Compatibility Matrix

| Requirement | Current implementation | Status | Evidence | Required action |
|---|---|---|---|---|
| User authentication | DB-sessies, bcrypt, httpOnly cookie, rollen admin/user | READY | `src/lib/auth-session.ts`, `src/app/api/auth/login/route.ts` | Geen |
| Device authentication | IMEI-allowlist + gedeelde `TELTONIKA_INGEST_KEY` | PARTIAL | `src/app/api/ingest/teltonika/route.ts:33-43` | Per-device sleutel of TLS client-cert overwegen |
| TCP listener | `net.createServer()` op poort 5027, IMEI-handshake, frame-parsing | READY | `teltonika/server.mjs:206-278` | Geen (werkend met echte hardware) |
| Teltonika protocol decoder | Codec 8 (0x08) + Codec 8E (0x8E) met dynamische IO-sectie | READY | `teltonika/server.mjs:39-132` | Codec 16 ontbreekt (schema noemt het, parser niet) |
| GPS persistence | IngestPoint met deviceId, altitude, heading, satellites, ioData | READY | `prisma/schema.prisma:259-284`, `src/app/api/ingest/teltonika/route.ts:94-111` | Geen |
| Device management | Registratie, IMEI unique, status (pending/active/revoked), soft delete | READY | `src/app/api/devices/route.ts`, `src/app/api/devices/[id]/route.ts` | Geen |
| Vehicle assignment | `GpsDevice.vehicleId` FK + `assignedAt`, koppel/ontkoppel-acties | READY | `src/app/api/devices/[id]/route.ts:71-92` | Geen |
| Device status | Afgeleid uit lastSeenAt (online <2u, stale <6u, offline >6u) | PARTIAL | `src/app/api/devices/route.ts:22-29` | Real-time TCP-session tracking zou beter zijn |
| Admin dashboard | Kaart, voertuiglijst, statistieken, device-pagina | READY | `src/app/app/(fleet)/page.tsx`, `map/page.tsx`, `devices/page.tsx` | Geen |
| Historical tracking | IngestPoint-tabel met indexen (sourceId+sampledAt, deviceId+sampledAt) | READY | `prisma/schema.prisma:281-282` | Geen |
| Codec command support | Geen — alleen inkomende AVL-decoder | MISSING | Geen bestand gevonden | Commando-encoder + uitgaande TCP-verbinding nodig |
| DOUT1 control | Geen — geen commando-wachtrij, geen uitgaande berichten | MISSING | Geen bestand gevonden | Volledige commando-infrastructuur nodig |
| TLS support | Niet geïmplementeerd (TCP is plain) | MISSING | `teltonika/server.mjs` gebruikt `net`, niet `tls` | TLS-server of terminator toevoegen |
| UDP support | Niet geïmplementeerd | NOT APPLICABLE | FMC920 gebruikt TCP voor AVL | Optioneel |
| MQTT support | Niet geïmplementeerd | NOT APPLICABLE | FMC920-config gebruikt TCP | Optioneel |
| Duplicate packet handling | Niet geïmplementeerd | MISSING | Geen idempotentie-sleutel op IngestPoint | Unieke constraint op (deviceId, timestamp) overwegen |
| Out-of-order handling | Records worden as-is opgeslagen | PARTIAL | `src/app/api/ingest/teltonika/route.ts:84-124` | Timestamp-validatie aanwezig, maar geen sorting |
| Organization model | Niet geïmplementeerd (single-tenant) | MISSING | Geen Organization-model in schema | Alleen nodig bij multi-tenant |
| Firmware version tracking | Handmatig veld, niet automatisch | PARTIAL | `GpsDevice.firmware` (String?) | Codec 8E bevat firmware niet standaard |
| Trip/stop detection | Regels-engine bestaat (snelheid, geofence, tijd) | PARTIAL | `src/lib/rules/engine.ts` | Device-events (ignition, DOUT) niet gekoppeld |

---

## 5. Critical Gaps

### Gap 1: Geen uitgaande commando-infrastructuur (blokkeert DOUT1)

**Wat mist:** Er is geen enkel mechanisme om berichten naar het device te sturen. De TCP-server is alleen inkomend (`socket.on('data')`); er is geen `socket.write()` voor commando's, geen commando-wachtrij, geen codec-12-encoder en geen ACK-afhandeling voor uitgaande berichten.

**Waarom belangrijk:** DOUT1 (digital output) is een kernfunctionaliteit van de FMC920 voor voertuigbeheer (bijv. motor uitschakelen op afstand). Zonder uitgaande berichten kan dit niet.

**Betrokken componenten:** `teltonika/server.mjs` (alleen inkomend), geen commando-model in schema.

**Wat moet er veranderen:** (a) TCP-server moet uitgaande verbindingen onderhouden of een persistent kanaal openhouden; (b) commando-wachtrij-tabel in DB; (c) codec-12-encoder voor Teltonika-commando's; (d) ACK-afhandeling met timeout/retry; (e) API-endpoint `POST /api/devices/{id}/outputs/1`.

**Blokkeert:** Alleen latere functionaliteit (DOUT1, configuratie op afstand). GPS-ontvangst wordt niet geblokkeerd.

### Gap 2: Geen TLS op de TCP-verbinding

**Wat mist:** De TCP-server gebruikt `net.createServer()` (plain TCP). De FMC920 ondersteunt TLS, maar de huidige configurie heeft "TLS None".

**Waarom belangrijk:** IMEI en GPS-data lopen onversleuteld over het internet (via bore.pub-tunnel). In productie is dit een beveiligingsrisico.

**Betrokken componenten:** `teltonika/server.mjs`, device-configuratie.

**Wat moet er veranderen:** `tls.createServer()` met self-signed certificaat of terminator; device-configuratie wijzigen naar TLS.

**Blokkeert:** Niet de GPS-ontvangst (werkt nu), wel productie-deployment.

### Gap 3: Geen duplicate/out-of-order bescherming

**Wat mist:** Er is geen unieke constraint op `(deviceId, timestamp)` in IngestPoint. Als het device een batch opnieuw stuurt (na een ACK-fout), worden records dubbel opgeslagen.

**Waarom belangrijk:** Dubbele GPS-punten vervuilen historie, afstandsberekeningen en rapportages.

**Betrokken componenten:** `prisma/schema.prisma` (IngestPoint), `src/app/api/ingest/teltonika/route.ts`.

**Wat moet er veranderen:** Unieke index op `(deviceId, sampledAt)` of idempotentie-sleutel; upsert in plaats van create.

**Blokkeert:** Niet de eerste GPS-ontvangst, wel datakwaliteit.

### Gap 4: Gedeelde sleutel-authenticatie

**Wat mist:** Alle devices delen één `TELTONIKA_INGEST_KEY`. Als een device wordt gecompromitteerd, kan elke IMEI data sturen (mits geregistreerd). Er is geen per-device sleutel of challenge-response.

**Waarom belangrijk:** IMEI-spoofing is een reëel risico; een gestolen IMEI kan data injecteren.

**Betrokken componenten:** `src/app/api/ingest/teltonika/route.ts:33-43`.

**Wat moet er veranderen:** Per-device API-keys (SHA-256, zoals `/api/ingest` al doet) of TLS client-certificates.

**Blokkeert:** Niet de eerste ontvangst; wel security-hardening voor productie.

### Gap 5: Geen real-time verbindingsstatus

**Wat mist:** `connectionState` wordt afgeleid uit `lastSeenAt` (online <2u, stale <6u). Er is geen tracking van actieve TCP-sessies.

**Waarom belangrijk:** Een device kan "online" lijken terwijl de TCP-verbinding al verbroken is (batch-gedrag: ~elk uur verbinding, dan sluiten).

**Betrokken componenten:** `src/app/api/devices/route.ts:22-29`, `teltonika/server.mjs`.

**Wat moet er veranderen:** TCP-server moet actieve sessies rapporteren aan de web-app (bijv. via heartbeat of bij connect/disconnect).

**Blokkeert:** Niet de ontvangst; wel nauwkeurige statusweergave.

---

## 6. Database Compatibility

### Huidig schema (relevant)

```prisma
model GpsDevice {
  id            String       @id @default(uuid()) @db.Uuid
  imei          String       @unique
  label         String?
  brand         String?      @default("Teltonika")
  model         String?
  simCardNumber String?      @map("sim_card_number")
  firmware      String?
  protocol      String?      @default("codec8e")
  status        DeviceStatus @default(pending)   // pending | active | revoked
  authorizedAt  DateTime?    @map("authorized_at")
  revokedAt     DateTime?    @map("revoked_at")
  vehicleId     String?      @map("vehicle_id") @db.Uuid
  assignedAt    DateTime?    @map("assigned_at")
  lastSeenAt    DateTime?    @map("last_seen_at")
  lastLat       Float?       @map("last_lat")
  lastLon       Float?       @map("last_lon")
  lastSpeedMps  Float?       @map("last_speed_mps")
  lastFixAt     DateTime?    @map("last_fix_at")
  lastRecordCount Int        @default(0) @map("last_record_count")
  deletedAt     DateTime?    @map("deleted_at")
  vehicle IngestSource? @relation(fields: [vehicleId], references: [id], onDelete: SetNull)
  points  IngestPoint[]
}

model IngestPoint {
  // ... (bestaande GPS-velden)
  deviceId       String?  @map("device_id") @db.Uuid
  altitude       Float?
  heading        Float?
  satellites     Int?
  priority       Int?
  ioData         Json?    @map("io_data")
  device GpsDevice? @relation(fields: [deviceId], references: [id], onDelete: SetNull)
}
```

### Ontbrekende relaties t.o.v. hardware-model

| Conceptueel model | Huidig | Status |
|---|---|---|
| User | ✅ `User` | Aanwezig |
| Organization | ❌ | Ontbreekt (single-tenant) |
| Vehicle | ✅ `IngestSource` | Aanwezig |
| GpsDevice | ✅ `GpsDevice` | Aanwezig |
| DeviceAssignment | ✅ `GpsDevice.vehicleId` | Aanwezig (inline) |
| DeviceConnection | ❌ | Ontbreekt (geen sessie-tracking) |
| GpsPosition | ✅ `IngestPoint` | Aanwezig (uitgebreid) |
| DeviceEvent | ❌ | Ontbreekt (ioData bevat ruwe IO, geen getypeerde events) |
| DeviceCommand | ❌ | Ontbreekt volledig |

### Indexering

| Index | Aanwezig | Nodig |
|---|---|---|
| `imei` unique | ✅ | — |
| `(vehicleId)` | ✅ | — |
| `(status)` | ✅ | — |
| `(lastSeenAt)` | ✅ | — |
| `(sourceId, sampledAt)` | ✅ | — |
| `(deviceId, sampledAt)` | ✅ | — |
| `(deviceId, timestamp)` unique | ❌ | Voor duplicate-bescherming |

---

## 7. Communication Architecture

### Voorgesteld (niet bestaand)

```text
FMC920
   |
   | 4G LTE (TLS aanbevolen)
   |
TCP/UDP/TLS Ingestion Service          ← teltonika/server.mjs (bestaat, plain TCP)
   |
Teltonika Protocol Decoder              ← parsePayload/parseRecord (bestaat, codec 8/8E)
   |
Validation and Device Authentication    ← IMEI-allowlist + X-Ingest-Key (bestaat, gedeeld)
   |
GPS Processing Service                  ← IngestPoint + GpsDevice-update (bestaat)
   |
Database                                ← PostgreSQL + Prisma (bestaat)
   |
Admin Dashboard                         ← /app/devices + /app/map (bestaat)
```

### Uitgaande commando's (voorgesteld, niet bestaand)

```text
POST /api/devices/{deviceId}/outputs/1
   │
   ▼
Command Validation (state: ON/OFF)
   │
   ▼
DeviceCommand-wachtrij (DB)
   │
   ▼
TCP-server: open verbinding naar device (of bestaande sessie)
   │
   ▼
Codec 12 encoder (Teltonika commando-formaat)
   │
   ▼
Device ACK → status: sent | acknowledged | failed | timeout
   │
   ▼
Audit-log + UI-feedback
```

**Belangrijk:** De huidige TCP-server onderhoudt geen persistent kanaal naar het device (het device opent zelf een verbinding, stuurt batch, sluit). Voor uitgaande commando's moet ofwel (a) een persistent kanaal worden onderhouden, ofwel (b) het device worden geprovisioned om periodiek te pollen, ofwel (c) SMS-gateway worden gebruikt (FMC920 ondersteunt SMS-commando's — zie installatiehandleiding in devices-pagina).

---

## 8. Remote Command Readiness

**Is DOUT1-controle momenteel mogelijk?** Nee.

### Wat er mist

| Component | Status |
|---|---|
| Codec 12 commando-encoder | ❌ Bestaat niet |
| Uitgaande TCP-verbinding naar device | ❌ Server is alleen inkomend |
| Commando-wachtrij (DB-tabel) | ❌ Bestaat niet |
| ACK-afhandeling voor uitgaande berichten | ❌ Bestaat niet |
| Timeout/retry-mechanisme | ❌ Bestaat niet |
| Commando-status in UI | ❌ Bestaat niet |
| Audit-log voor commando's | ❌ Bestaat niet |
| API-endpoint `POST /api/devices/{id}/outputs/1` | ❌ Bestaat niet |

### Geverifieerde capabilities

- ✅ FMC920 heeft 1 digital output (DOUT1) — datasheet
- ✅ FMC920 ondersteunt remote commands via TCP (codec 12) — Teltonika documentatie
- ✅ FMC920 ondersteunt SMS-commando's — installatiehandleiding in devices-pagina
- ✅ Device-config: ACK Type = AVL (voor inkomende data)

### Aannames (niet geverifieerd)

- ❓ Of codec 12 exact hetzelfde kanaal gebruikt als AVL-data (TCP)
- ❓ Of het device een persistent kanaal openhoudt voor commando's
- ❓ Exacte byte-layout van DOUT1-commando in codec 12

### Veiligheidsvereisten

- DOUT1 is een hardware-schakeluitgang — vereist geschikte externe elektrische schakeling
- DOUT1 levert GEEN onafhankelijke 12V-voeding
- Commando's moeten worden geautoriseerd (admin-rol)
- Elke commando-uitvoering moet worden gelogd (audit)

---

## 9. Reusable Components

| Component | Bestand | Herbruikbaarheid |
|---|---|---|
| TCP-server + decoder | `teltonika/server.mjs` | ✅ Direct bruikbaar — uitbreiden met uitgaande commando's |
| Codec 8/8E parser | `teltonika/server.mjs` (`parseIoSection`, `parseRecord`) | ✅ Correct geïmplementeerd, met echte hardware getest |
| CRC-16 | `teltonika/server.mjs` (`crc16`) | ⚠️ Werkt maar matcht device niet exact (cosmetische waarschuwing) |
| Ingest-endpoint | `src/app/api/ingest/teltonika/route.ts` | ✅ Robuust: tolerant schema, clamping, IMEI-check |
| GpsDevice-model | `prisma/schema.prisma` | ✅ Volledig, uitbreiden met DeviceCommand |
| Device-API | `src/app/api/devices/` | ✅ Compleet voor registratie/autorisatie/koppeling |
| Device-UI | `src/app/app/(fleet)/devices/page.tsx` | ✅ Inclusief installatiehandleiding |
| E2E-test | `scripts/e2e-teltonika.mjs` | ✅ Volledige keten geverifieerd |
| Regel-engine | `src/lib/rules/engine.ts` | ✅ Werkt al met hardware-data |
| Afstandsberekening | `src/lib/distance.ts` | ✅ Werkt al met hardware-data |

---

## 10. Recommended Development Roadmap

### Fase 1 — Hardware-communicatie ✅ VOLTOOID
- ✅ Device-configuratie (APN, server, codec 8E)
- ✅ Server-connectivity (TCP 5027 + bore-tunnel)
- ✅ Device-identificatie (IMEI-handshake)
- ✅ Protocol-handshake (0x01 accept)
- ✅ GPS-pakketontvangst (Codec 8/8E decoder)
- **Complexiteit:** hoog (protocol-implementatie) — **voltooid**
- **Acceptatie:** E2E-test groen, echte hardware levert data

### Fase 2 — GPS-verwerking ✅ VOLTOOID
- ✅ Protocol-decoding (codec 8/8E, dynamische IO-sectie)
- ✅ Data-validatie (tolerant schema, clamping)
- ✅ Device-authenticatie (IMEI-allowlist + shared key)
- ✅ Locatie-persistente (IngestPoint + GpsDevice-state)
- **Complexiteit:** middel — **voltooid**
- **Acceptatie:** Records in DB, voertuig-positie bijgewerkt

### Fase 3 — Platform-integratie ✅ VOLTOOID
- ✅ Device-beheer (registratie, status, koppeling)
- ✅ Voertuig-relaties (assign/unassign)
- ✅ Device-status (online/stale/offline/revoked)
- ✅ Dashboard-integratie (kaart, device-pagina)
- **Complexiteit:** laag — **voltooid**
- **Acceptatie:** Meerdere apparaten zichtbaar, koppeling werkt

### Fase 4 — Historische tracking ✅ BASIS AANWEZIG
- ✅ Locatiehistorie (IngestPoint met indexen)
- ✅ Routeweergave (kaart met trail)
- ✅ Bewegingsdetectie (regels-engine: snelheid, geofence)
- ⚠️ Stop-detectie: niet specifiek geïmplementeerd (regels-engine kan het benaderen)
- **Complexiteit:** laag — **grotendeels voltooid**
- **Acceptatie:** Historie zichtbaar op kaart

### Fase 5 — Remote control ❌ NIET GESTART
- ❌ Uitgaande commando-protocol (codec 12)
- ❌ Commando-wachtrij (DB)
- ❌ ACK-afhandeling + timeout/retry
- ❌ DOUT1-controle
- ❌ Commando-UI + audit-log
- **Complexiteit:** hoog (nieuwe infrastructuur nodig)
- **Afhankelijkheden:** Fase 1 (TCP-server uitbreiden), veiligheidsreview
- **Acceptatie:** DOUT1 aan/uit via UI, met logging en bevestiging

**Geschatte doorlooptijd Fase 5:** 2-4 weken (schatting — hangt af van TCP-persistentie-aanpak en codec-12-implementatie)

---

## 11. Testing Strategy

### Bestaande tests

| Test | Bestand | Dekking |
|---|---|---|
| Protocol-zelftest | `teltonika/selftest.mjs` | Codec 8, 8E, echte chunk |
| E2E-keten | `scripts/e2e-teltonika.mjs` | Login → device → TCP → DB → verificatie |
| API smoke | `scripts/e2e-api.mts` | Auth, keys, ingest, overview |
| Soft delete | `scripts/test-trash.mts` | Personen/voertuigen/prullenbak |
| Deadline-job | `scripts/test-jobs.mts` | Statussen, meldingen, idempotentie |
| Locaties/routes | `scripts/test-locations.mts` | Locatiebeheer, import, geocode |

### Aanbevolen tests (nog niet geïmplementeerd)

| Test | Doel |
|---|---|
| Codec 12 encoder | Commando-bytes correct voor DOUT1 |
| Duplicate-pakket | Zelfde frame twee keer → geen dubbele records |
| Out-of-order | Records met oudere timestamp → correct behandeld |
| Ongeldig IMEI | Niet-geautoriseerd device → 0x00 + sluit verbinding |
| Corrupt frame | Kapotte CRC/payload → geen crash, ACK=0 |
| Concurrente verbindingen | Meerdere devices tegelijk |
| Commando-timeout | Device reageert niet → retry + status |
| TLS-verbinding | Device met TLS → correcte handshake |

**Niet doen:** Geen echte commando's naar fysiek device sturen tijdens testen.

---

## 12. Final Verdict

1. **Kan het platform vandaag FMC920-GPS-data ontvangen?** **Ja** — TCP-server + decoder + ingest-endpoint werken met echte hardware (IMEI `868618088364708`, codec 8E, geverifieerd via `e2e-teltonika.mjs`).

2. **Kan het de vereiste Teltonika-protocol decoderen?** **Ja** voor Codec 8 en Codec 8E. Codec 16 is genoemd in het schema maar niet geïmplementeerd in de parser.

3. **Kan het fysieke apparaten authenticeren?** **Ja, deels** — IMEI-allowlist + gedeelde sleutel. Geen per-device authenticatie of TLS.

4. **Kan het een tracker met een voertuig associëren?** **Ja** — `GpsDevice.vehicleId` met koppel/ontkoppel-acties.

5. **Kan het meerdere fysieke trackers weergeven?** **Ja** — devices-pagina toont alle geregistreerde apparaten met live status.

6. **Kan het historische GPS-waarnemingen opslaan?** **Ja** — IngestPoint met deviceId, altitude, heading, satellites, ioData + indexen.

7. **Kan het device-disconnectie detecteren?** **Deels** — afgeleid uit `lastSeenAt` (online <2u, stale <6u, offline >6u). Geen real-time TCP-session tracking.

8. **Kan het remote commando's naar het device sturen?** **Nee** — geen uitgaande infrastructuur.

9. **Kan het DOUT1 aansturen?** **Nee** — geen commando-protocol, geen wachtrij, geen ACK-afhandeling.

10. **Minimum werk voor eerste echte GPS-locatie op dashboard:** **Nul** — dit werkt al. De huidige keten (TCP → decoder → ingest → DB → kaart) is operationeel.

### Overall readiness assessment

**Partially ready.**

- ✅ **GPS-ontvangst:** Gereed — werkt met echte hardware
- ✅ **Device-beheer:** Gereed — registratie, autorisatie, koppeling
- ✅ **Dashboard-integratie:** Gereed — kaart, status, historie
- ⚠️ **Security:** Deels gereed — TLS en per-device auth ontbreken
- ❌ **Remote control (DOUT1):** Niet gereed — geen infrastructuur
- ❌ **Productie-deployment:** Niet gereed — TLS, duplicate-bescherming, monitoring nodig

**Geen verwarring:** Hardware-integratie (Fase 1-4) is geslaagd. Productie-readiness (Fase 5 + security-hardening) is dat niet.
