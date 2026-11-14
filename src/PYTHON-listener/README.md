# FMC920 GPS Listener

> **⚠️ EXPERIMENTEEL / NIET het productiepad.**
> De productieve pipeline is: FMC920 → TCP-tunnel → `teltonika/server.mjs`
> (Node) → `POST /api/ingest/teltonika` → database → kaart. Deze
> Python-listener is een alternatieve ontwerpvariant: hij POST't naar
> `/api/gps`, dat alleen het laatste record **in memory** bewaart (geen
> DB-write) en in productie achter sessie-authenticatie zit. Gebruik deze
> code dus alleen voor lokaal experimenteer-/ontwikkelwerk.

Een compacte Python-service met twee ingangen:

- FastAPI op `http://localhost:8000` voor status en service-informatie.
- Een Teltonika TCP-listener op poort `5027` voor AVL-data van de FMC920.

## Installeren en starten

```powershell
py -m venv .venv
.venv\Scripts\Activate.ps1
py -m pip install -r requirements.txt
py fmc920_listener.py
```

De interactieve API-documentatie staat op `http://localhost:8000/docs`.

## HTTP-routes

- `GET /` geeft de servicestatus en beschikbare routes.
- `GET /api/me` geeft informatie over deze listener. Dit is service-informatie, geen ingelogd gebruikersprofiel.

## FMC920 instellen

De FMC920 verstuurt AVL-data via TCP of UDP naar een serveradres en poort die in de apparaatconfiguratie worden ingesteld. Er is geen universeel standaarddomein voor een eigen listener. Stel onder GPRS / Server Settings het volgende in:

- Domain: het publiek bereikbare IP-adres of domein van deze server.
- Port: `5027` (of de ingestelde `TCP_PORT`).
- Protocol: `TCP`.
- TLS: uit, tenzij TLS apart op deze server wordt geconfigureerd.

`localhost` en `127.0.0.1` verwijzen op de tracker naar de tracker zelf, niet naar je computer. Een tracker buiten je lokale netwerk heeft een publiek adres nodig; configureer ook firewall- en routerport-forwarding. Voor lokaal testen is een TCP-tunnel nodig. De SIM/APN moet mobiele data ondersteunen.

Deze applicatie ondersteunt TCP met Teltonika Codec 8 en Codec 8 Extended, inclusief IMEI-handshake, CRC-controle en de vereiste record-ACK. Configureer de FMC920 daarom op TCP, niet UDP.

## Configuratie

Instellingen zijn via omgevingsvariabelen aan te passen:

| Variabele | Standaard | Betekenis |
| --- | --- | --- |
| `HTTP_HOST` | `0.0.0.0` | Bind-adres van FastAPI |
| `HTTP_PORT` | `8000` | Poort van FastAPI |
| `HTTP_LOG_PATH` | `http_requests.jsonl` naast de app | JSONL-bestand voor ontvangen HTTP-verzoeken |
| `TCP_HOST` | `0.0.0.0` | Bind-adres voor de tracker |
| `TCP_PORT` | `5027` | Teltonika TCP-poort |
| `CSV_PATH` | `gps_records.csv` naast de app | CSV-opslaglocatie |
| `WEBHOOK_URL` | `http://localhost:3000/api/gps` | Optionele HTTP-doorgifte; leeg laten om uit te schakelen |

Records worden eerst naar CSV opgeslagen en daarna optioneel naar de webhook gestuurd. Een webhookfout voorkomt de Teltonika-ACK niet.

Elk HTTP-verzoek dat FastAPI bereikt wordt met volledige URL, headers en body naar de console geschreven en als JSON-regel opgeslagen. JSON-bodies worden ook als `body_json` opgeslagen; ongeldige JSON en HTTP-foutstatussen krijgen `valid: false`. Binaire bodies worden als Base64 opgeslagen. Verzoeken die Uvicorn al op protocolniveau afwijst, bereiken FastAPI niet en bevatten mogelijk geen leesbare URL (bijvoorbeeld TLS-verkeer naar een gewone HTTP-poort).

Gebruik voor web- of HTTPS-verkeer een HTTP(S)-tunnel die TLS beëindigt en doorstuurt naar `HTTP_PORT` (`8000`). Een `tcp://`-tunnel is alleen ruwe TCP; gebruik die voor Teltonika-verkeer naar `TCP_PORT` (`5027`). HTTPS/TLS rechtstreeks naar de HTTP-poort veroorzaakt `Invalid HTTP request received` en kan geen URL of HTTP-body opleveren.

## Testen

```powershell
py -m unittest discover -s tests -v
```

## Broninformatie

- [FMC920 GPRS-instellingen](https://wiki.teltonika-gps.com/view/FMC920_GPRS_settings)
- [Teltonika data sending protocols](https://wiki.teltonika-gps.com/view/Teltonika_Data_Sending_Protocols)