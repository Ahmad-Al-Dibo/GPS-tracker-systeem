# Beslissing 005 — Tracking alleen bij actieve pagina

**Datum:** 2026-10-10  
**Status:** vastgelegd  
**Context:** Browsers throttelen/suspenden JS op achtergrond; geen betrouwbare background-GPS via web.

## Keuze

Location sharing werkt **alleen zolang de trackingpagina actief is**.  
`watchPosition` + heartbeat stoppen bij tab-close/lock; server markeert offline via timeout.

## Gevolgen

- Geen claim van 24/7 tracking in de browser.
- Voor continue tracking later: native app of dedicated hardware-adapter (bijv. Teltonika).
- UI-toasting: "Deellocatie alleen zolang deze pagina open is."
