# UI/UX fase 2 — Mobiele fotoactie en blijvende uploadstatus

Startpunt: commit na UI/UX fase 1 (`ddd4357`). Historische rapporten zijn niet gewijzigd.

## Migratie
`0028_uiux2_unieke_wachtrijpaden.sql` (toegepast): een gedeeltelijke unieke index op `fotos.storage_path` voor wachtrijpaden (`…/q_…`). Read-only controle vooraf: 1874 rijen, één bestaand duplicaat op een oud niet-wachtrijpad. Dat duplicaat valt buiten de index en is niet aangeraakt.

## Wijzigingen
- **Wachtrij** (`offline-queue.ts`, IDB v2): nieuwe index `by-station-cat`, willekeurige queue-ID's, bevroren `pad`/`voorbereid`, lease (`claimItem`, 120 s, atomair over tabs), `bevries`, `opnieuwKlaarzetten`, foutsoort `beheer` en `getQueueCountVoor` via key-cursors. `queuePhoto` resolveert pas na een voltooide transactie.
- **Versturen** (`sync-service.ts`): iedere foto gaat via de wachtrij, ook online. Er wordt eenmalig voorbereid; oude items worden vóór de eerste netwerkpoging bevroren. Een aanroep tijdens een lopende sync plant een extra ronde. Weigeringen door beheer worden gemarkeerd zonder PIN-vraag. Na `beheer-veranderd` hervat `App.tsx` de wachtrij.
- **Upload/registratie** (`fotos-service.ts`): bij een INSERT-fout of exceptie wordt eerst op pad herlezen. Het bestand wordt nooit verwijderd.
- **Upload-hook** (`use-station-upload.ts`): de bestanden worden direct vastgelegd. Online volgt eerst de bestaande `fotowerkVoorActie` (voorgrond, dus een PIN-vraag mag). Daarna voorbereiden en bewaren, en pas dan versturen. Offline met een beschermd dossier wordt geweigerd. Bij volle opslag komt een concrete melding.
- **Wizard** (`WizardView.tsx`):
  - een stationsregel met nummer · naam, of "Geen stationsnummer"
  - "Foto maken" als primaire knop met icoon en tekst
  - "Uit bibliotheek" (48 px)
  - "Later invullen" (48 px)
  - "Verder: [categorie]" plus "Nog een foto" zodra het vereiste aantal er is
  - het automatische doorgaan is verwijderd
  - een status op elke tegel (tekst en icoon) plus een live statusregel
  - tikken op een mislukte tegel probeert dezelfde foto opnieuw
- **Previews**: `use-wachtrij-categorie.ts` laadt alleen de blobs van de geopende categorie en deelt object-URL's per queue-ID met een referentietelling.
- **Opleveren**: het tellen elke 3 s (dat blobs uitleest) is vervangen door key-cursor-tellingen die op wachtrij-events reageren.

## Uitgevoerde verificatie
- `bash scripts/test-local-pg.sh`: **31 bestanden, 245 tests geslaagd**, inclusief alle lokale PostgreSQL-tests.
- Nieuw `src/test/uiux-fase2.test.tsx` (15 tests, fake-indexeddb, fictieve opslag/DB):
  - twee offline foto's met dezelfde bestandsnaam, categorie heen en terug, remount
  - opslag-write met verloren response, en INSERT gecommit met verloren response: precies 1 rij en 1 bestand, niets verwijderd
  - onzekere INSERT-fout verwijdert niets
  - PNG-compressie eerst mislukt, daarna JPEG: hetzelfde bevroren pad, compressie maar één keer
  - twee tabs met hetzelfde queue-ID: exclusieve lease en één registratie
  - item dat na een crash op "uploading" bleef staan, wordt hervat
  - verlopen PIN of inmiddels opgeleverd: bestand blijft, foutsoort `beheer`, geen achtergrond-PIN, hervat na ontgrendelen
  - tellen per station zonder blobs
  - snelle categoriewissel
  - IndexedDB vol: geen "bewaard"
  - beschermd dossier offline
  - wizard: context-fallback, CTA's, geen automatische overgang, statusteksten, dedup tegen serverfoto op pad
- Aangepaste oude test (`fase2.test.ts`): "registratie mislukt → bestand opgeruimd" is nu "geen succes, bestand blijft voor een veilige retry op hetzelfde pad" (geen rij). Mocks in `modulariteit`/`fase2` zijn aangevuld. De quota-test in `definitieve-keuzes` simuleert nu een fout in de echte IDB-`add`.
- De bestaande regressie met 250 foto's zonder blobs is ongewijzigd en slaagt.
- `tsc --noEmit -p tsconfig.app.json` en `vite build` zijn geslaagd.
- Headless Chromium op 360/390/428 px met een bestaand conceptstation, zonder upload:
  - stationsregel zichtbaar, met fallback
  - "Foto maken", "Uit bibliotheek" en "Later invullen" volledig in beeld
  - "Foto maken" opent de camerakiezer (`capture=environment`)
  - het notitievenster opent
  - de route is startpagina → station (1) → "Doorgaan" (2) → "Foto maken" (3), daarna de native camera

## Grenzen
- Geen productie-upload, beoordeling of SharePoint-requests. Echte Storage/RLS-afwijzing tijdens een upload is alleen met een nep-server getest, niet op de echte opslag.
- Het echte mobiele toetsenbord en camera's van iOS/Android zijn niet getest; Chromium-emulatie dekt alleen layout en de bestandskiezer.
- Een bestand dat na een definitieve weigering achterblijft (bijv. RLS-fout op INSERT) blijft in de opslag staan. Dat is bewust, voor een veilige retry; er is geen automatische opruiming.
- Overgang: de gepubliceerde frontend gebruikt nog `nieuwPad` (geen q_-pad) voor directe uploads en blijft werken. Na publicatie gaan alle nieuwe foto's via de wachtrij.
