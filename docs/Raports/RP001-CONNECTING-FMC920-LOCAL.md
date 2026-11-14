# RP001 — FMC920 lokaal verbinden en testen

**Status:** Grotendeels gelukt — circa 80%  
**Prioriteit:** Hoog  
**Datum:** 2026-11-11 10:00 AM

## Samenvatting

De lokale TCP-verbinding met de FMC920 is opgezet en getest. De TCP-listener heeft datarecords van de FMC920 ontvangen. De volledige doorgifte naar de React/Next.js-app is echter nog niet bevestigd: de GPS-data zijn daar niet aangekomen. De koppeling is dus bijna klaar, maar de end-to-endtest is nog niet geslaagd.

## Probleem

De domeinnaam is nog niet actief. Het kan naar verwachting ongeveer zeven dagen duren voordat deze beschikbaar is. Omdat de website nog in ontwikkeling is, was een lokale testopstelling nodig om de FMC920 alvast te kunnen testen en de website voor te bereiden.

## Uitgevoerde acties en resultaat

1. [x] Een Python TCP-listener (`fmc920_listener.py`) gemaakt.
2. [x] De TCP-listener via Pinggy getest.
3. [x] De FMC920 ingesteld om data naar het Pinggy TCP-adres te sturen.
4. [x] De Next.js-app voorzien van een `POST /api/gps`-endpoint dat JSON accepteert en de ontvangen payload in de serverconsole logt.
5. [ ] De volledige gegevensstroom van de FMC920 via de TCP-listener naar de app bevestigd.

**Wat werkt:** De TCP-listener heeft records van de FMC920 teruggekregen. Daarmee is bevestigd dat de tracker via de TCP-tunnel de listener kan bereiken en data verstuurt.

**Wat nog niet werkt of bevestigd is:** De records zijn niet bij de React/Next.js-app aangekomen. De app heeft de GPS-payload dus nog niet ontvangen of gelogd. Het bestaan van het `/api/gps`-endpoint betekent nog niet dat de TCP-listener de records ook als HTTP POST doorstuurt.

## Vervolgacties

1. Controleer of de TCP-listener de ontvangen records omzet naar de JSON-vorm die `POST /api/gps` verwacht en daadwerkelijk naar het juiste lokale HTTP-adres doorstuurt.
2. Controleer in de listener de HTTP-respons en statuscode van de POST; leg fouten vast in de listenerconsole.
3. Controleer of `POST /api/gps` bereikbaar is vanaf de listener. De route valt momenteel onder de sessiebescherming van de app; een apparaat- of listenerverzoek zonder geldige sessie kan daarom worden geweigerd.
4. Test eerst een handmatige POST met JSON en controleer of die in de serverconsole van de app verschijnt.
5. Herhaal daarna de end-to-endtest: FMC920 → Pinggy → TCP-listener → HTTP POST → app-console.
6. Noteer bij een geslaagde test de ontvangen JSON, HTTP-statuscode en bevestig dat gevoelige gegevens zoals API-sleutels niet in logs terechtkomen.

## Conclusie

De lokale verbinding met de FMC920 is **bijna gelukt**: de TCP-listener ontvangt records van het apparaat. Het resterende probleem zit in de volgende stap: de records zijn nog niet aangekomen in de React/Next.js-app. Daarom is de status circa 80% en blijft de volledige end-to-endtest open totdat de HTTP-doorgifte en eventuele toegangsbeveiliging zijn gecontroleerd.
