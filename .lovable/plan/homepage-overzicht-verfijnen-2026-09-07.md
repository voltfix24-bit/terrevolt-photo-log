# Homepage-overzicht verfijnen

## Aanpassingen
- Verwijder het vaste statusicoon uit gewone projectrijen; toon alleen een uploadicoon bij wachtrij-items of een klok bij meer dan zeven dagen inactiviteit.
- Maak de voortgangsstatus betekenisvoller: grijs bij 1–3 open taken, amber vanaf 4, groen met vinkje bij klaar en blauw met uploadicoon bij wachtrij-items.
- Maak de voortgangsbalk 2px hoog en ingesprongen binnen de rij; versterk de volle rijscheiding subtiel.
- Normaliseer stationsnamen uitsluitend bij weergave naar hoofdletter-eerst, met behoud van bekende afkortingen zoals LS, MS, TO en ATR.
- Verberg filterchips met nul resultaten en voorkom dat een verborgen actieve filter een lege lijst veroorzaakt.
- Voeg naast de filterchips een compacte sorteerkeuze toe met “Bijna klaar”, “Laatst bewerkt” en “Naam A-Z”; onthoud deze lokaal per monteur.
- Maak het zoek- en filtergebied compacter en plaats “Nieuw station” als vaste, gecentreerde groene knop onderaan, met voldoende vrije ruimte onder de lijst.

## Technische details
- Bestaande routes, sleutels, state-namen, gegevens en kleuren blijven behouden.
- Voor “Laatst bewerkt” wordt de meest recente beschikbare wijzigingsdatum van station of foto gebruikt, met aanmaakdatum als terugval.
- De naamnormalisatie gebeurt alleen tijdens rendering en wijzigt geen brongegevens.

## Controle
- Test het overzicht op 360px met een stationsnaam van meer dan 40 tekens.
- Controleer afzonderlijk de statussen klaar, acht te gaan en uploads in wachtrij op tekst én icoongebruik.
- Controleer sorteren, lege chips, de vaste knop en horizontale overloop.
