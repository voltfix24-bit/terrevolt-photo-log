# Compacte stationskop en vaste hoofdactie — resultaat

Startpunt: 8651431. Geen database-, function- of publicatiewijzigingen.

## Wat is veranderd
- **Navigatierij**: Stations · compacte beheercontrol ("Beheer" / "Beheer actief") · Meer. De grote beheerbalk is op de stationsweergave vervangen; andere routes en de laadstatus van het station houden de globale balk.
- **Eén statusbron** (`src/lib/beheer-status-store.ts`): één poller (zelfde `beheer_status`-RPC, 30 s, `beheer-veranderd`, focus, auth-events) voor de globale balk én de compacte control; lock/unlock via dezelfde `vergrendelBeheer`/`zorgVoorBeheer` en meldingen. Compacte control in de kop (normale documentflow), popover met eindtijd en vergrendel-/ontgrendelknop.
- **Titel** `naam_msr` (24px, breekt af, geen ellipsis) met eenmalig "Case {nr} · Behuizing {nr}"; ontbrekende nummers worden weggelaten.
- **Casegegevens** (standaard dicht): opdrachtgever, jaar, casenaam (alleen als die afwijkt van de titel), type ruimte, Datum, Ingevuld door, fototellers, normale SharePoint-status en Documenten (10 Documenten). Kruimelpad op deze weergave verwijderd; `/documenten`-deeplink opent Casegegevens en scrolt pas na zichtbaarheid. Meer → Documenten doet hetzelfde.
- **Meer**: PDF bekijken, Delen, Link kopiëren, Foto's bekijken (opgeleverd, als dat niet de hoofdactie is), ZIP downloaden (bij foto's), Documenten, Wijzig station (bestaande PIN-check). PDF/Delen staan niet meer onderin.
- **Werkfase** (`src/lib/station-werkfase.ts`) bepaalt voortgang en de ene hoofdactie: Nog niet gestart → "Start fotowerk" + "Eerst: …"; deels → "{X} van {N} onderdelen ingevuld" + "Verder met fotowerk" + "Volgende: …"; ingevuld → "Fotochecklist ingevuld · Nog niet opgeleverd · n foto's" + "Opleveren"; opgeleverd → "Dossier beoordelen" (TerreVolt) of "Foto's bekijken"; goedgekeurd → "Foto's bekijken". Ingevuld = `categorieKlaar` of N.v.t. over toepasselijke categorieën. "Nieuw" alleen als er aantoonbaar niets is: geen serverfoto's, N.v.t., lokale wachtrij-items (ook verstuurd), bewaren, submitted_at, afkeurreden of afgekeurde foto's; onbekend telt als begonnen. Laden/leesfout tonen geen nul- of compleetmelding en geen hoofdactie.
- **Uitzonderingen altijd zichtbaar**: opleverketenfouten/uitstel, SharePoint mislukt/uitgesteld/leesfout (`SharePointStatus deel="uitzondering"`, normale status alleen in Casegegevens — nooit dubbel), afkeurreden, wachtrij-leesfout, "n foto's worden bewaard", "n foto's niet verstuurd · Versturen mislukt — opnieuw proberen" (via bestaande `verstuur` → `syncPendingPhotos`), "n foto's nog te versturen".
- **Wachtrijsamenvatting** (`getWachtrijSamenvattingVoor` + `useStationWachtrij`): key-cursor/status-index, geen Blobs; reageert op QUEUE_EVENT, negeert antwoorden van een vorig station; done telt niet als nog te versturen.
- **Onderste balk**: gemeten hoogte (ResizeObserver) bepaalt de ruimte onder de laatste categorie; geen vaste 190/250px-spacers.

## Controles
- Vitest: nieuw `src/test/compacte-stationskop.test.tsx` (16 tests: werkfase-regels incl. alle "niet nieuw"-signalen, all-N.v.t., laden/leesfout, opgeleverd/goedgekeurd; wachtrijsamenvatting per station; stationguard van de hook; één poller en vrijgeven compacte registratie). Volledige suite: 32 bestanden / 262 tests geslaagd (5 lokale-PostgreSQL-bestanden overgeslagen; niets aan database gewijzigd). Typecheck en productiebuild geslaagd.
- Headless Chromium, alle schrijfverzoeken geblokkeerd (0 geblokkeerd nodig), 320/390/428/1280 en 320 met 130% zoom:
  - Nieuweweg 38 Hattem (0313990, geen behuizingsnummer): "Nog niet gestart · 0 van 41 onderdelen", "Eerst: Typeplaatje / fabricagenummer", "Start fotowerk"; eerste sectiekaart begint op ±240px (320–1280), ruim binnen het eerste scherm.
  - Halfje Bruin (0318770): "Fotochecklist ingevuld · Nog niet opgeleverd · 71 foto's", knop "Opleveren"; nooit "Alle taken afgerond".
  - Opgeleverd dossier (0320221): "Dossier beoordelen" onderin, Foto's bekijken/ZIP in Meer, "In SharePoint ✓" in Casegegevens.
  - Geen horizontale scroll; knop 52px; laatste categorie 40–44px (bij 130%: ~100px) boven de balk; navigatierij past op één regel op 320px.
  - Meer: Escape geeft focus terug aan de Meer-knop; beheerpopover toont status en knop; Casegegevens opent.
  - `/documenten`-deeplink opent Casegegevens; wizard openen verbergt de balk; terug naar Stations brengt de globale beheerbalk terug.
  - Gemockt: fotolezing faalt → "Fotostatus kon niet worden gelezen", geen hoofdactie; afkeurreden + submitted_at → afkeurmelding zichtbaar en "Verder met fotowerk" (geen Start); lokale wachtrij (1 fout, 1 pending, 1 verstuurd, offline) → "1 foto niet verstuurd · Versturen mislukt — opnieuw proberen" en "1 foto nog te versturen".

## Beperkingen
- Grotere tekst gesimuleerd met CSS-zoom 130%, niet met iOS/Android-systeemtekstgrootte; niet op echte toestellen getest.
- Beheer actief (ontgrendeld) niet live getest (geen PIN gebruikt); de popoverinhoud bij actief is alleen via code en de gedeelde store-test gedekt.
- Goedgekeurd-dossier en partiële voortgang in de browser niet op echte data bekeken; gedekt door unit-tests.
- Echte opnieuw-versturen niet uitgevoerd (writes geblokkeerd).
- Niet gepubliceerd.
