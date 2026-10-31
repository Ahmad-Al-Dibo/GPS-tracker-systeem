# Beslissing 004 — 4-staten model + heartbeat-timeout

**Datum:** 2026-10-10  
**Status:** vastgelegd  
**Context:** Eén boolean `active` beschrijft tab-open, sharing, netwerk en logout niet apart.

## Keuze

Statussen: `sharing` | `online` | `offline` | `logged_out`.  
Berekend op server:

- `logged_out`: sessie `revoked_at` of `expires_at` verstreken
- `offline`: sessie ok, maar `last_heartbeat_at` ouder dan **75 seconden**
- `sharing`: sessie ok, heartbeat recent, `sharing_enabled = true`
- `online`: sessie ok, heartbeat recent, sharing uit

Client stuurt heartbeat ~elke **20 seconden** (ook zonder nieuwe GPS-fix).

## Configuratie

| Constante | Waarde | Waar |
| --- | --- | --- |
| HEARTBEAT_INTERVAL_MS | 20000 | client |
| OFFLINE_AFTER_MS | 75000 | server (`src/lib/presence.ts`) |
| SESSION_TTL_MS | 12 uur | server (login) |

## Gevolgen

- Tab dicht of netwerk weg → offline na ~75s, niet "actief" tot logout.
- Start/stop sharing verandert `sharing_enabled`, niet de sessie zelf.
