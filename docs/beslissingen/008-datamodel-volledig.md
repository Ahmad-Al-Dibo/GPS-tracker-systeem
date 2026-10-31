# Beslissing 008 — Datamodel: sessions + points + latest + settings + audit

**Datum:** 2026-10-11  
**Status:** vastgelegd  
**Bron:** ontwerp §4.1

## Keuze (doelmodel)

| Tabel | Functie |
| --- | --- |
| `organizations` | Één org in demo; `organization_id` vanaf start |
| `users` | username uniek per org; rol; accountstatus |
| `sessions` | heartbeat / expires / revoked |
| `tracking_sessions` | start/stop + source_type + sharing |
| `location_points` | historie; `event_id` uniek; sampled_at + received_at |
| `latest_locations` | upsert alleen bij nieuwere sampled_at |
| `tracking_settings` | N, heartbeat, offline-timeout, stale, refresh, retention |
| `audit_logs` | rol/instelling/blokkering/export |

## Relatie met huidige code

- `location_shares` (v2) wordt **vervangen** door `latest_locations` + `tracking_sessions`.
- Heartbeat blijft op `sessions`.
- Historie via `location_points` (fase ingestie).
