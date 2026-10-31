# User Stories en Functionele Eisen – GPS-beheersysteem

## 1. Doel van het systeem

Het doel is om een modern, overzichtelijk en gebruiksvriendelijk GPS-beheersysteem te ontwikkelen waarmee de klant personen, voertuigen en GPS-trackers kan beheren en voertuigen live op een kaart kan volgen.

Het systeem slaat de relevante gegevens op in een database en ondersteunt het koppelen van personen, voertuigen en GPS-trackers. Daarnaast berekent het systeem de gereden afstand en snelheid en registreert het de locatiegeschiedenis van voertuigen volgens nog vast te stellen GPS-instellingen.

## 2. Inloggen en gebruikersbeheer

### US-01 – Inloggen

**User story**

Als gebruiker wil ik met mijn gebruikersnaam en wachtwoord kunnen inloggen op de website, zodat ik toegang krijg tot de functionaliteiten waarvoor ik rechten heb.

**Acceptatiecriteria**
- De gebruiker kan een gebruikersnaam en wachtwoord invoeren.
- Het systeem controleert de ingevoerde inloggegevens.
- Bij geldige inloggegevens krijgt de gebruiker toegang tot het systeem.
- Bij ongeldige inloggegevens krijgt de gebruiker een duidelijke foutmelding.
- Wachtwoorden worden veilig opgeslagen en niet als leesbare tekst in de database bewaard.
- Het systeem houdt rekening met de rollen en rechten van de gebruiker.

### US-02 – Gebruikers, rollen en rechten beheren

**User story**

Als beheerder wil ik gebruikers, rollen en toegangsrechten kunnen beheren, zodat iedere gebruiker alleen toegang heeft tot de functies die voor hem of haar zijn toegestaan.

**Acceptatiecriteria**
- Gebruikersgegevens worden in de database opgeslagen.
- Rollen en rechten worden in de database opgeslagen.
- Het systeem controleert de rechten voordat een gebruiker een beveiligde handeling uitvoert.
- Belangrijke acties van gebruikers kunnen in logbestanden worden geregistreerd.

## 3. Personenbeheer

### US-03 – Een persoon toevoegen

**User story**

Als beheerder wil ik via de website een persoon aan de database kunnen toevoegen, zodat ik de gegevens van personen die aan voertuigen gekoppeld kunnen worden centraal kan beheren.

**Gegevens van een persoon**
- Naam
- E-mailadres
- Telefoonnummer
- Adres
- Land
- Postcode
- Woonplaats
- Notities, bijvoorbeeld klachten of bijzonderheden

**Acceptatiecriteria**
- De beheerder kan een persoon via een formulier toevoegen.
- Het systeem controleert de verplichte velden en de geldigheid van de ingevoerde gegevens.
- De gegevens worden opgeslagen in de database.
- De beheerder kan bestaande personen bekijken, bewerken en verwijderen.
- Het systeem controleert bij het verwijderen of de persoon nog aan voertuigen gekoppeld is en voorkomt onbedoeld verlies van gerelateerde gegevens.

## 4. Voertuigenbeheer

### US-04 – Een voertuig toevoegen

**User story**

Als beheerder wil ik via de website een voertuig aan de database kunnen toevoegen, zodat ik de voertuigen binnen het GPS-systeem kan registreren en beheren.

**Gegevens van een voertuig**
- Kenteken
- Merk
- Type
- Kleur
- Bouwjaar
- Chassisnummer
- Startkilometerstand
- Notities, bijvoorbeeld klachten of technische bijzonderheden

**Acceptatiecriteria**
- De beheerder kan een voertuig via een formulier toevoegen.
- Het systeem controleert de verplichte velden en de geldigheid van de gegevens.
- De gegevens worden opgeslagen in de database.
- Het systeem voorkomt, waar van toepassing, dat hetzelfde voertuig meerdere keren wordt geregistreerd.
- De beheerder kan voertuigen bekijken, bewerken en verwijderen.
- De startkilometerstand wordt bewaard als uitgangspunt voor de berekening van de actuele kilometerstand.

## 5. GPS-trackers beheren

### US-05 – Een GPS-tracker toevoegen

**User story**

Als beheerder wil ik via de website een GPS-tracker aan de database kunnen toevoegen, zodat ik GPS-apparaten en hun technische gegevens kan beheren.

**Gegevens van een GPS-tracker**
- Serienummer
- Merk
- Type
- SIM-kaartnummer
- Gegevens die nodig zijn om de locatie via een GPS-API of externe dienst te ontvangen

**Acceptatiecriteria**
- De beheerder kan een GPS-tracker via een formulier toevoegen.
- De gegevens worden opgeslagen in de database.
- Iedere tracker kan op basis van een unieke identificatie worden herkend.
- Het systeem kan onderscheid maken tussen geregistreerde trackers en trackers waarvan de verbinding niet beschikbaar is.
- De beheerder kan de gegevens van een tracker bekijken, bewerken en verwijderen.

**Technische opmerking:** het serienummer kan als identificatie worden gebruikt als dit door de leverancier wordt ondersteund. Anders moet het systeem een geschikte unieke tracker-ID gebruiken. API-sleutels en andere geheimen moeten veilig worden opgeslagen.

## 6. Personen, voertuigen en GPS-trackers koppelen

### US-06 – Een GPS-tracker aan een voertuig koppelen

**User story**

Als beheerder wil ik een GPS-tracker aan een voertuig kunnen koppelen, zodat de ontvangen GPS-gegevens aan het juiste voertuig worden toegewezen.

**Acceptatiecriteria**
- De beheerder kan bij een voertuig een geregistreerde GPS-tracker selecteren.
- Het systeem slaat de koppeling op in de database.
- Het systeem gebruikt de unieke identificatie van de tracker om de ontvangen locatiegegevens aan het juiste voertuig te koppelen.
- Het systeem controleert of een tracker al aan een ander voertuig gekoppeld is, volgens de ingestelde koppelregels.
- De beheerder kan een bestaande koppeling wijzigen of verwijderen.

### US-07 – Een persoon aan een voertuig koppelen

**User story**

Als beheerder wil ik een persoon aan een voertuig kunnen koppelen, zodat zichtbaar is welke persoon of personen bij een voertuig horen.

**Acceptatiecriteria**
- De beheerder kan bij een voertuig een bestaande persoon selecteren.
- Het systeem slaat de koppeling op in de database.
- De beheerder kan meerdere personen aan hetzelfde voertuig koppelen.
- De beheerder kan één persoon aan meerdere voertuigen koppelen.
- De beheerder kan bestaande koppelingen wijzigen of verwijderen.
- Het verwijderen van een koppeling verwijdert niet automatisch de gegevens van de persoon of het voertuig zelf.

**Ontwerpkeuze:** het systeem moet een relatie tussen personen en voertuigen ondersteunen waarbij meerdere personen aan meerdere voertuigen gekoppeld kunnen zijn (many-to-many). De klant heeft nog niet bevestigd of alle combinaties daadwerkelijk nodig zijn, maar het datamodel wordt hier alvast op voorbereid.

### US-08 – Verschillende soorten GPS-trackers ondersteunen

**User story**

Als beheerder wil ik GPS-trackers van verschillende typen kunnen registreren, zodat het systeem zowel fysieke GPS-apparaten als een eventuele GPS-trackerapp kan ondersteunen.

**Acceptatiecriteria**
- Het datamodel kan onderscheid maken tussen een fysieke GPS-tracker en een tracker die via een app werkt.
- Beide typen kunnen, indien geactiveerd, aan een voertuig worden gekoppeld.
- Het systeem verwerkt de locatiegegevens volgens de gegevensbron van het betreffende type tracker.

**Status:** ondersteuning voor GPS-tracking via een app moet nog door de klant worden bevestigd. De architectuur houdt hier alvast rekening mee.

## 7. Dashboard en live kaart

### US-09 – Een dashboard met live voertuiglocaties bekijken

**User story**

Als beheerder wil ik na het inloggen een overzichtelijk dashboard met een kaart kunnen bekijken, zodat ik in één oogopslag de locaties van de voertuigen kan zien.

**Acceptatiecriteria**
- Het dashboard heeft een eenvoudige, moderne en overzichtelijke vormgeving.
- De kaart is de eerste pagina die de gebruiker na het openen van het dashboard ziet.
- Voertuigen met een gekoppelde en beschikbare GPS-tracker worden op de kaart weergegeven.
- De getoonde locaties worden bijgewerkt zodra nieuwe GPS-gegevens binnenkomen.
- Het systeem maakt duidelijk wanneer een locatie niet actueel is of wanneer een tracker offline is.
- De gebruiker kan een voertuig op de kaart selecteren.

### US-10 – Voertuiggegevens via een pop-up bekijken

**User story**

Als beheerder wil ik op een voertuig op de kaart kunnen klikken, zodat ik direct de belangrijkste gegevens van het voertuig en de gekoppelde personen kan bekijken.

**Acceptatiecriteria**
- Bij het selecteren van een voertuig verschijnt een pop-up.
- De pop-up toont de relevante voertuiggegevens.
- De pop-up toont de gekoppelde persoon of personen.
- Als meerdere personen aan het voertuig gekoppeld zijn, worden zij allemaal weergegeven.
- De pop-up bevat een knop waarmee de beheerder naar de detailpagina van het voertuig kan gaan.

## 8. Detailpagina van een voertuig

### US-11 – Voertuiggegevens beheren

**User story**

Als beheerder wil ik op de detailpagina van een voertuig de gegevens kunnen bekijken, bewerken en verwijderen, zodat ik de voertuigregistratie actueel kan houden.

**Acceptatiecriteria**
- De detailpagina toont de opgeslagen voertuiggegevens.
- De beheerder kan de voertuiggegevens bewerken en opslaan.
- De beheerder kan het voertuig verwijderen, volgens de ingestelde verwijderregels.
- Wijzigingen worden in de database opgeslagen.

### US-12 – De gekoppelde GPS-tracker beheren

**User story**

Als beheerder wil ik op de detailpagina van een voertuig de gekoppelde GPS-tracker kunnen bekijken, wijzigen, ontkoppelen of vervangen, zodat de voertuigregistratie overeenkomt met de daadwerkelijk gebruikte tracker.

**Acceptatiecriteria**
- De detailpagina toont de gekoppelde GPS-tracker.
- De beheerder kan de gegevens van de tracker openen en bewerken.
- De beheerder kan de tracker van het voertuig ontkoppelen.
- De beheerder kan een andere geregistreerde tracker aan het voertuig koppelen.
- Het systeem verwerkt de wijzigingen in de database.

### US-13 – Gekoppelde personen beheren

**User story**

Als beheerder wil ik op de detailpagina van een voertuig de gekoppelde personen kunnen bekijken, toevoegen en ontkoppelen, zodat ik de relaties tussen personen en voertuigen kan beheren.

**Acceptatiecriteria**
- De detailpagina toont alle gekoppelde personen.
- De beheerder kan een bestaande persoon aan het voertuig koppelen.
- De beheerder kan een gekoppelde persoon ontkoppelen.
- De beheerder kan de gegevens van een persoon openen en, indien toegestaan, bewerken.
- Een ontkoppeling verwijdert niet automatisch de persoon uit de database.

## 9. GPS-locaties, snelheid en kilometerstand

### US-14 – GPS-locaties opslaan

**User story**

Als klant wil ik dat het systeem de ontvangen GPS-locaties van voertuigen opslaat, zodat ik de actuele locatie en de locatiegeschiedenis van voertuigen kan bekijken.

**Acceptatiecriteria**
- Het systeem ontvangt locatiegegevens van de gekoppelde GPS-tracker.
- Locatiegegevens worden aan het juiste voertuig gekoppeld.
- Het systeem slaat relevante gegevens op, zoals coördinaten en het tijdstip van de meting.
- Het systeem voorkomt onnodige dubbele locatiegegevens volgens de ingestelde opslagregels.
- De actuele locatie kan worden onderscheiden van oudere locatiegegevens.
- Het systeem houdt rekening met ontbrekende, ongeldige of verouderde GPS-metingen.

### US-15 – De snelheid van een voertuig berekenen en opslaan

**User story**

Als klant wil ik de snelheid van een voertuig kunnen bekijken en bewaren, zodat ik inzicht krijg in het rijgedrag en de beweging van het voertuig.

**Acceptatiecriteria**
- Het systeem verwerkt de beschikbare snelheidsgegevens van de GPS-tracker.
- Wanneer de tracker zelf geen bruikbare snelheid levert, kan het systeem de snelheid berekenen uit opeenvolgende GPS-metingen, voor zover die gegevens daarvoor geschikt zijn.
- De snelheid wordt samen met het bijbehorende tijdstip en voertuig geregistreerd wanneer dit volgens het opslagbeleid nodig is.
- Het systeem houdt rekening met onbetrouwbare GPS-metingen en onrealistische snelheidswaarden.

### US-16 – De gereden afstand berekenen

**User story**

Als klant wil ik dat het systeem de gereden afstand van een voertuig berekent, zodat de kilometerstand automatisch kan worden bijgewerkt.

**Acceptatiecriteria**
- Het systeem berekent de afgelegde afstand op basis van opeenvolgende bruikbare GPS-metingen.
- Het systeem kan de gereden afstand per rit en over een langere periode berekenen.
- Het systeem gebruikt de geregistreerde startkilometerstand als uitgangspunt.
- De actuele kilometerstand wordt bijgewerkt volgens een nog vast te stellen rekenmethode.
- Het systeem telt dezelfde gereden afstand niet meerdere keren mee.
- Het systeem houdt rekening met onnauwkeurige GPS-metingen en ontbrekende meetpunten.

**Belangrijke ontwerpkeuze:** de kilometerstand mag niet bij iedere nieuwe GPS-meting opnieuw worden verhoogd met de totale afstand sinds het begin van de rit. Alleen nieuw afgelegde afstand mag worden toegevoegd. De precieze berekening en de momenten waarop de kilometerstand wordt bijgewerkt, moeten nog worden vastgesteld.

## 10. GPS-opslaglogica bij stilstand en beweging

### US-17 – Locaties registreren wanneer een voertuig stilstaat

**User story**

Als klant wil ik dat het systeem bij stilstaande voertuigen onnodige locatiegegevens beperkt, zodat de database niet onnodig groot wordt door herhaalde metingen op vrijwel dezelfde locatie.

**Voorgestelde acceptatiecriteria**
- Het systeem bepaalt of opeenvolgende GPS-metingen binnen een ingestelde afstand van elkaar liggen.
- Wanneer een voertuig binnen de ingestelde afstand blijft, kan het systeem herhaalde metingen overslaan.
- Het systeem bewaart voldoende informatie om de laatst bekende locatie en de stilstand van het voertuig te kunnen bepalen.
- Het systeem kan, indien nodig, periodiek een nieuwe locatie registreren, ook wanneer het voertuig niet beweegt.
- De ingestelde afstand en eventuele registratie-interval zijn configureerbaar.

**Nog te bepalen:** de maximale afstand \(N\) in meters en de eventuele interval waarmee een stilstaand voertuig opnieuw wordt geregistreerd.

### US-18 – Locaties registreren wanneer een voertuig beweegt

**User story**

Als klant wil ik dat het systeem de GPS-locaties van bewegende voertuigen registreert, zodat ik de afgelegde route kan reconstrueren en de gereden afstand kan berekenen.

**Voorgestelde acceptatiecriteria**
- Het systeem bepaalt op basis van GPS-gegevens of een voertuig beweegt.
- Zodra de ingestelde bewegingsvoorwaarde is bereikt, begint of hervat het systeem de registratie van relevante locaties.
- Locaties worden geregistreerd op basis van een ingestelde snelheid, afstand, tijdsinterval of combinatie daarvan.
- Het systeem stopt of vermindert de registratie wanneer het voertuig weer stilstaat, volgens de ingestelde opslagregels.
- De geregistreerde gegevens blijven beschikbaar voor routegeschiedenis en afstandsberekeningen.

**Nog te bepalen:** de minimale snelheid \(N\) in km/u en de precieze methode waarmee het systeem bewegingsdetectie en locatieopslag uitvoert.

**Voorlopige werking**

1. Het systeem ontvangt een GPS-meting.
2. Het systeem controleert de snelheid en de afstand tot de vorige bruikbare meting.
3. Het systeem bepaalt of het voertuig stilstaat of beweegt.
4. Bij stilstand beperkt het systeem onnodige dubbele metingen.
5. Bij beweging registreert het systeem de relevante locaties.
6. Het systeem gebruikt de opgeslagen metingen voor routegeschiedenis en afstandsberekeningen.

De definitieve waarden en voorwaarden worden bepaald tijdens de technische uitwerking en de testfase.

## 11. Gegevensopslag en systeemondersteuning

### US-19 – Gegevens permanent opslaan

**User story**

Als klant wil ik dat de gegevens van het GPS-systeem betrouwbaar worden opgeslagen, zodat informatie beschikbaar blijft wanneer ik de website opnieuw open of wanneer de server opnieuw wordt gestart.

**Gegevens die het systeem moet kunnen opslaan of beheren**
- Gebruikers
- Rollen en toegangsrechten
- Personen
- Voertuigen
- GPS-trackers
- Koppelingen tussen personen, voertuigen en GPS-trackers
- GPS-locaties en locatiegeschiedenis
- Snelheidsgegevens
- Gereden afstanden en kilometerstanden
- Gebruikerslogs
- Systeeminstellingen
- Notificaties
- Berichten
- Taken
- Rapporten
- Statistieken
- Systeemconfiguratie
- Back-ups

**Acceptatiecriteria**
- De gegevens die bij de kernfunctionaliteit horen, worden duurzaam opgeslagen.
- Relaties tussen gegevens blijven consistent.
- Het systeem controleert of verwijzingen naar personen, voertuigen en trackers geldig zijn.
- Het systeem voorkomt ongewenst gegevensverlies bij het wijzigen of verwijderen van gekoppelde gegevens.
- Het systeem beschikt over een back-up- en herstelstrategie.
- Toegang tot gegevens en systeemfuncties wordt gecontroleerd op basis van gebruikersrechten.

De onderdelen notificaties, berichten, taken, rapporten en statistieken moeten nader worden uitgewerkt voordat hun volledige functionaliteit kan worden vastgesteld. Ook moet worden bepaald welke informatie rechtstreeks in de database wordt opgeslagen en welke informatie als bestand of via een externe dienst wordt beheerd.

## 12. Nog te bevestigen beslissingen

De volgende punten moeten met de klant worden afgestemd voordat de bijbehorende functionaliteit definitief wordt gebouwd.

| Onderwerp | Openstaande beslissing |
|---|---|
| GPS-tracker via app | Moet het systeem naast fysieke GPS-apparaten ook een mobiele app als GPS-bron ondersteunen? |
| Personen en voertuigen | Mogen meerdere personen aan één voertuig gekoppeld zijn en mag één persoon meerdere voertuigen hebben? Het datamodel ondersteunt dit voorlopig. |
| Trackeridentificatie | Wordt het serienummer gebruikt of is een ander uniek device-ID nodig? |
| Locatieopslag bij stilstand | Welke afstand in meters \(N\) bepaalt of een nieuwe meting als dezelfde locatie wordt beschouwd? |
| Locatieopslag bij beweging | Welke snelheid, afstand of tijdsinterval bepaalt wanneer locaties worden opgeslagen? |
| Kilometerstand | Wanneer en hoe wordt de berekende afstand bij de startkilometerstand opgeteld? |
| Live updates | Hoe vaak worden locaties bijgewerkt en hoe snel moet een nieuwe locatie op het dashboard verschijnen? |
| Offline trackers | Na hoeveel tijd zonder GPS-data wordt een tracker als offline beschouwd? |
| Rollen en rechten | Welke soorten gebruikers zijn er en welke acties mag iedere rol uitvoeren? |
| Verwijderen van gegevens | Wat moet er gebeuren wanneer een voertuig, persoon of tracker nog gekoppelde gegevens heeft? |
| Aanvullende modules | Welke functionaliteit is vereist voor berichten, notificaties, taken, rapporten en statistieken? |
| Back-ups | Hoe vaak worden back-ups gemaakt, hoe lang worden ze bewaard en hoe wordt herstel getest? |

## 13. Algemene kwaliteitscriteria

- De website heeft een moderne, overzichtelijke en gebruiksvriendelijke interface.
- De kernfunctionaliteiten werken op basis van gegevens uit de database en niet uitsluitend met tijdelijke gegevens in de browser.
- Formulieren valideren invoer en geven duidelijke foutmeldingen.
- Alleen bevoegde gebruikers kunnen gegevens bekijken of wijzigen.
- Het systeem verwerkt GPS-gegevens op een manier die dubbele registraties en onbetrouwbare metingen zoveel mogelijk beperkt.
- Het systeem kan omgaan met offline apparaten, ontbrekende gegevens en tijdelijke verbindingsproblemen.
- De applicatie biedt voldoende logging om belangrijke fouten en gebruikersacties te kunnen onderzoeken.
- Back-ups worden zodanig beheerd dat herstel mogelijk blijft als de primaire database uitvalt.
