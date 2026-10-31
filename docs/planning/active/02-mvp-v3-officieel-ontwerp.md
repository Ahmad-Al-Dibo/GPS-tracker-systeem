# MVP Plan v3 — Officieel technisch ontwerp

**Status:** actief  
**Datum:** 2026-10-11  
**Leidend document:** `docs/GPS_Tracking_Platform_Technisch_Ontwerp_Testplan.docx` (v1.0)  
**Vervangt/uitbreidt:** `01-mvp-v2-heartbeat-sharing.md` (heartbeat-basis blijft behouden)

## 0. Kernbesluit (uit ontwerp)

Bouw eerst een **foreground-webdemo**. 24/7 achtergrondtracking is een aparte producteis (native app of hardware). Browser kan OS-suspensie niet garanderen.

## 1. Doel

Werknemer registreert/inlogt en deelt vrijwillig locatie. Owner/dispatcher ziet statussen en locaties. Systeem bewaart **latest location** en — wanneer ingesteld — **historische punten** voor routes.

## 2. Huidige staat (v2) vs doel (v3)

| Gebied | Nu (v2) | Doel (v3) |
| --- | --- | --- |
| Rollen | admin, worker | **owner** (CLI), **dispatcher**, **worker** |
| Organisatie | geen | `organizations` (+ org-id op users) |
| Locatie | alleen `location_shares` | `tracking_sessions` + `location_points` + `latest_locations` |
| Idempotentie | geen event_id | `event_id` uniek, retries veilig |
| Instellingen | hardcoded constants | `tracking_settings` per org (N, HB, offline, stale, refresh, retention) |
| Audit | geen | `audit_logs` |
| Accountstatus | geen | active/blocked |
| Status | 4 statussen | 5 dimensies (account, connectivity, tracking, freshness, gps quality) |
| Historie UI | geen | periode + polyline + gaten |
| Tests | e2e smoke | P0/P1-set uit ontwerp §8 |
| Rate limiting | geen | login/register/location |

## 3. Architectuur (behouden + uitbreiden)

- Next.js 16 monoliet + PostgreSQL + Prisma  
- DB-sessies + httpOnly cookie (beslissing 001)  
- Polling dashboard 5s (SSE later)  
- Leaflet + OSM  
- Intern ingest-contract zodat native/hardware later kan aansluiten (§3.2)

## 4. Datamodel (doel)

Zie beslissing 008 en ontwerp §4.1. Kernregels:

- `sampled_at` (bron) ≠ `received_at` (server) — NFR-02  
- `latest_locations` upsert **alleen** bij nieuwere `sampled_at` — NFR-03  
- `location_points.event_id` uniek — idempotentie  
- Settings server-side gevalideerd 5–300s voor N — FREQ-03  

## 5. API (doel, ontwerp §4.3)

| Groep | Endpoints |
| --- | --- |
| Auth | register (worker), login, logout, GET /me |
| Tracking | start, heartbeat, **locations** (batch, event_id), stop |
| Admin | dashboard, workers, locations, history, settings GET/PATCH, user role/status PATCH, audit-log |

Worker-id altijd uit sessie. Org-filter op alle admin-queries.

## 6. Statuslogica (server)

```
account:     users.status
connectivity: heartbeat > offline_timeout → offline
              sessie weg/verlopen → logged_out / session_expired
tracking:     actieve tracking_session + sharing_enabled
freshness:    now - sampled_at > stale_grens → stale; geen fix → none
gps:          accuracy > 100m → low_accuracy (startpunt)
```

## 7. Implementatiefasen (uit ontwerp §6, aangepast op huidige code)

### Fase A — Fundament uitbreiden (schema + owner)
- [ ] Migratie: organizations, uitbreiding users (org, role owner/dispatcher/worker, status)
- [ ] CLI `npm run owner:init` (idempotent, max 1 owner)
- [ ] tracking_settings seed + validatie
- [ ] audit_logs schema
- [ ] Rollen-middleware: owner/dispatcher/worker

### Fase B — Tracking lifecycle + ingestie
- [ ] tracking_sessions start/stop (i.p.v. alleen location_shares-vlag)
- [ ] POST /api/tracking/locations met event_id, sampled_at, batch-limiet
- [ ] latest_locations upsert-regel (nieuwere sampled_at)
- [ ] location_points historie-insert
- [ ] Client: N-interval planner, outbox (IndexedDB of memory+limiet), retry/backoff
- [ ] Heartbeat los van locatie (behouden)

### Fase C — Dashboard + instellingen
- [ ] Statuschips: 5 dimensies apart
- [ ] Owner: settings-pagina (N, HB, offline, stale, refresh, retention)
- [ ] Dispatcher: workers + live kaart (alleen org)
- [ ] Polling 5s + p95-meetpunt (logging)

### Fase D — Historie + rollen + audit
- [ ] History endpoint + polyline + gaten
- [ ] PATCH role/status (owner)
- [ ] Audit bij settings/rol/blokkering/export

### Fase E — Betrouwbaarheid + testplan
- [ ] Rate limits (login, register, location)
- [ ] Account blocked → sessies intrekken
- [ ] P0-tests: AUTH, TRK, DAT, FREQ-03/06, NET-01/03/06, DASH-01/02/03/07, SEC-01/05
- [ ] E2E-uitbreiding scripts
- [ ] Retentiejob (eenvoudig scheduled)

### Fase F — Later / productiepad
- 72u soak, loadtest 100 bronnen, native/hardware, DPIA/OR

## 8. Definition of Done (MVP volgens ontwerp §9)

1. Worker registreert, logt in, start/stop expliciet.  
2. Backend accepteert alleen bevoegde, valide events; retries idempotent; latest + historie correct.  
3. Dashboard toont connectivity, sharing en freshness **apart**.  
4. Owner kan N wijzigen (5–300); wijziging geaudit en toegepast.  
5. Dispatcher ziet alleen eigen org.  
6. P0-tests geslaagd; 24u synthetische staging-run met rapport (minimaal PERF-01-achtig).  
7. Geen 24/7-belofte voor browserforeground.

## 9. Testprioriteiten (samenvatting)

| P | Inhoud | Release |
| --- | --- | --- |
| P0 | AUTH, stop/consent, data-integriteit, role isolation, SEC IDOR | blokkerend |
| P1 | frequentie, dashboard p95, netwerkherstel, historie, settings | of geaccepteerd |
| P2 | UX, schaal >10 | documenteren |

Volledige cases: ontwerp §8 (AUTH-01…REC-03).

## 10. Openstaand / te bevestigen met opdrachtgever

- [ ] Acceptatiegrenzen N, stale, offline, retentie (defaults in ontwerp voorstellen)  
- [ ] Of dispatcher-rollen direct nodig zijn of alleen owner+worker voor eerste demo  
- [ ] Bewaartermijn en privacydoel (§12)  
- [ ] Of historie in eerste release of alleen latest  

## 11. Relatie met beslissingen

- 001 DB-sessies — behouden  
- 002 username login — behouden  
- 003 alleen laatste locatie — **deels herzien**: latest + optionele history-table  
- 004 heartbeat/offline — behouden, drempels nu settings  
- 005 alleen actieve pagina — behouden  
- 006–009 — nieuw volgens ontwerp  
