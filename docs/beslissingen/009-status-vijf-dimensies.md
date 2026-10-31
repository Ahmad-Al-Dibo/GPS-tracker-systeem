# Beslissing 009 — Statusmodel: vijf dimensies, niet één veld

**Datum:** 2026-10-11  
**Status:** vastgelegd  
**Bron:** ontwerp §4.2

## Keuze

| Dimensie | Waarden |
| --- | --- |
| Account | `active` / `blocked` |
| Connectiviteit | `connected` / `offline` / `logged_out` / `session_expired` |
| Tracking | `not_sharing` / `sharing` / `stopped` |
| Locatieversheid | `fresh` / `stale` / `none` (op **sampled_at**) |
| GPS-kwaliteit | `good` / `low_accuracy` / `unknown` |

Dashboard toont deze **apart**. Heartbeat blijft los van GPS-versheid (NFR-02, NFR-08, NFR-09).

## Drempels (defaults, configureerbaar)

| Instelling | Default | Bereik |
| --- | --- | --- |
| Upload-interval N | 15 s | 5–300 s |
| Heartbeat | 20 s | 10–60 s |
| Offline-timeout | max(3×HB, 60 s) | 30–600 s |
| Stale-grens | max(3×N, 60 s) | gebonden aan N |
| Dashboard-refresh | 5 s | 3–30 s |
| Retentie | 30 dagen (voorstel) | beleid |
