# FMC920 verbinden via Pinggy TCP

## Kort antwoord

De FMC920 verstuurt Teltonika AVL-data via ruwe TCP. Gebruik daarom een Pinggy
`tcp://`-tunnel die naar de lokale Teltonika-poort `5027` doorstuurt. De
`https://`-adressen zijn voor browser/API-verkeer naar FastAPI op poort `8000`;
die zijn niet geschikt als serveradres voor de tracker.

## Listener starten

Open PowerShell in de repository-root en start de Python-listener:

```powershell
Set-Location 'src\PYTHON-listener'; & '.\.venv\Scripts\python.exe' 'fmc920_listener.py'
```

De listener start FastAPI op `127.0.0.1:8000` en de Teltonika TCP-server op
`127.0.0.1:5027`. Laat dit venster open.

## TCP-tunnel starten

Open een tweede PowerShell-venster en voer uit:

```powershell
ssh -o StrictHostKeyChecking=accept-new -p 443 -R0:127.0.0.1:5027 tcp@free.pinggy.io
```

Gebruik `127.0.0.1` zodat de tunnel naar hetzelfde IPv4-adres gaat waarop de
listener luistert. Laat ook dit venster open. De gratis Pinggy-tunnel verloopt
na ongeveer 60 minuten; bij elke nieuwe tunnel kunnen hostnaam en publieke poort
veranderen.

Pinggy gaf tijdens de test dit TCP-adres:

```text
tcp://yatqu-145-116-248-140.run.pinggy-free.link:45317
```

Dit zijn tijdelijke testwaarden, geen vast adres.

## FMC920-instellingen

Voor de bovenstaande tunnel:

| Instelling | Waarde |
| --- | --- |
| Domain / Server address | `yatqu-145-116-248-140.run.pinggy-free.link` |
| Port | `45317` |
| Protocol | `TCP` |
| TLS / SSL | Uit |

Vul bij Domain alleen de hostnaam in: zonder `tcp://`, `https://` of een
poortnummer. De Port is de publieke poort die Pinggy na `:` toont, niet de
lokale poort `5027`. Gebruik na opnieuw starten van Pinggy de nieuwe hostnaam
en poort.

## Testresultaten

De lokale Teltonika-handshake is getest met IMEI `356307042441013` en gaf ACK
`0x01` (geaccepteerd). Deze test stuurde alleen de IMEI-handshake; er is geen
testlocatie opgeslagen.

Een verbindingstest naar het publieke Pinggy-adres liep vast met een timeout.
Daarom is de lokale listener getest, maar is de externe TCP-verbinding vanaf
deze omgeving niet end-to-end bevestigd. Het adres en de poort hierboven zijn
wel door Pinggy toegewezen. Bij een geslaagde verbinding moet de
Python-listener `Incoming Teltonika connection` tonen, gevolgd door
`Accepted FMC920 IMEI ...`.

## Wat eerder misging

- De `https://...`-links en `GET 200 OK /` kwamen van de HTTP-tunnel naar poort
  `8000`. Dat bewijst dat browserverkeer werkt, niet dat de tracker TCP kan
  bereiken.
- Een `tcp://`-adres is alleen bruikbaar voor de tracker als die tunnel naar
  lokale poort `5027` is gestart. Een eerder getoond TCP-adres zonder
  bevestigde lokale bestemming kon dus niet veilig als trackerinstelling worden
  overgenomen.
- De listener bindt aan `127.0.0.1`; daarom is dat adres expliciet gebruikt in
  de SSH-forwarding in plaats van `localhost`.
- `http_requests.jsonl` bevat HTTP-verzoeken die FastAPI bereikt. Teltonika
  AVL-records komen via TCP binnen en worden niet in dat HTTP-log opgeslagen.

## Exacte verificatiecommando's

Controle van de lokale luisterpoorten:

```powershell
Start-Sleep -Seconds 2; Get-NetTCPConnection -LocalPort 8000,5027 -State Listen -ErrorAction SilentlyContinue | Select-Object LocalAddress,LocalPort,OwningProcess
```

Lokale Teltonika-handshake-test:

```powershell
$targetHost = '127.0.0.1'; $targetPort = 5027; $imei = [Text.Encoding]::ASCII.GetBytes('356307042441013'); $hello = New-Object byte[] ($imei.Length + 2); $hello[0] = [byte](($imei.Length -shr 8) -band 255); $hello[1] = [byte]($imei.Length -band 255); [Array]::Copy($imei, 0, $hello, 2, $imei.Length); $client = New-Object System.Net.Sockets.TcpClient; $client.ReceiveTimeout = 5000; try { $client.Connect($targetHost, $targetPort); $stream = $client.GetStream(); $stream.Write($hello, 0, $hello.Length); $ack = $stream.ReadByte(); Write-Output "Local Teltonika IMEI handshake ACK=0x$('{0:X2}' -f $ack)" } finally { $client.Close() }
```

De externe test gebruikte:

```powershell
$remoteHost = 'yatqu-145-116-248-140.run.pinggy-free.link'; $remotePort = 45317; $imei = [Text.Encoding]::ASCII.GetBytes('356307042441013'); $hello = New-Object byte[] ($imei.Length + 2); $hello[0] = [byte](($imei.Length -shr 8) -band 255); $hello[1] = [byte]($imei.Length -band 255); [Array]::Copy($imei, 0, $hello, 2, $imei.Length); $client = New-Object System.Net.Sockets.TcpClient; $client.ReceiveTimeout = 10000; $client.SendTimeout = 10000; try { $client.Connect($remoteHost, $remotePort); $stream = $client.GetStream(); $stream.Write($hello, 0, $hello.Length); $ack = $stream.ReadByte(); Write-Output "TCP connection succeeded; Teltonika IMEI handshake ACK=0x$('{0:X2}' -f $ack)" } finally { $client.Close() }
```

Deze externe test eindigde met een timeout bij het verbinden met de publieke
host en poort. De deviceverbinding moet daarom nog in de praktijk worden
bevestigd.
