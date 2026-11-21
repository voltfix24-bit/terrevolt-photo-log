# Mobiele UI-publicatiecheck (basis 128a95c)

Script: `scripts/mobile-ui-check.py` (Playwright, headless Chromium, `is_mobile`/touch, DPR 2).
Commando: `python3 scripts/mobile-ui-check.py [uitvoermap]` → per stap screenshot + `resultaat.json`.

## Testopzet en databron
- Echte data alleen-lezend via de gewone anonieme sessie (RLS ongewijzigd, geen omzeiling).
- Alle schrijfverzoeken geblokkeerd in de testbrowser (503-antwoord): alleen GET/HEAD, lees-RPC's (beheer_status, url_candidates, heeft_beheer, fotowerk_toegestaan, case_wv_suggesties, dossier_eindcontrole), opleverketen `actie:"status"`, sharepoint-documenten (lezen) en token-refresh doorgelaten.
- Werkelijk geblokkeerd tijdens de run: `POST /functions/v1/oplever-rapport` (rapport-opener). Geen uploads, notities, beoordelingen, opleveringen, imports, deletes, instellingen, PIN of SharePoint-sync.
- "Beheer"-variant: alleen `heeft_beheer`=true en `beheer_status` gemockt in het script om ontgrendelde UI te tonen; schrijven blijft geblokkeerd. Geen PIN ingevoerd.
- Fixtures/intercepties staan alleen in het script, niet in de app. Excelimport gebruikt fictieve geplakte rijen (TEST-0001/0002, lange naam, lege naam, bestaand nummer); er is niet op importeren gedrukt.
- Metingen per stap: document-scrollWidth vs viewport, interactieve elementen <44px, invoer <16px, elementen buiten viewport.

## Routematrix (159 metingen, 0× pagina-overflow, 0× invoer <16px)
| Scherm/staat | Route | Breedtes | Data | Resultaat |
|---|---|---|---|---|
| Stations start | `/` | 320, 390, 430 | echte data, alleen-lezen | geen overflow; resterend <44px: — |
| Stations zoeken | `/` | 320, 390, 430 | echte data, alleen-lezen | geen overflow; resterend <44px: — |
| Nieuw station | `/stations/new` | 320, 390, 430, 320 zoom130% | echte data, alleen-lezen | geen overflow; resterend <44px: bv. 2026-0142, bv. MSR-9920-X, bv. Renovatie Heyendaal, bv. Sint Martinusstraat 49NB |
| Station nieuw | `/van-gelder/2026/0313990-nieuweweg-38-hattem` | 320, 390, 430, 390 beheer-UI (gemockt), 320 zoom130%, 740 liggend 740×360 | echte data, alleen-lezen; beheer gemockt | geen overflow; resterend <44px: — |
| Station Meer | `/van-gelder/2026/0313990-nieuweweg-38-hattem` | 320, 390, 430, 390 beheer-UI (gemockt), 320 zoom130%, 740 liggend 740×360 | echte data, alleen-lezen; beheer gemockt | geen overflow; resterend <44px: — |
| Station-popover | `/van-gelder/2026/0313990-nieuweweg-38-hattem` | 320 beheer-UI (gemockt), 390 beheer-UI (gemockt), 430 beheer-UI (gemockt), 390 beheer-UI (gemockt), 320 zoom130%, 740 liggend 740×360 | echte data, alleen-lezen; beheer gemockt | geen overflow; resterend <44px: — |
| Station Casegegevens open | `/van-gelder/2026/0313990-nieuweweg-38-hattem` | 320, 390, 430, 390 beheer-UI (gemockt), 320 zoom130%, 740 liggend 740×360 | echte data, alleen-lezen; beheer gemockt | geen overflow; resterend <44px: — |
| Station onderkant | `/van-gelder/2026/0313990-nieuweweg-38-hattem` | 320, 390, 430, 390 beheer-UI (gemockt), 320 zoom130%, 740 liggend 740×360 | echte data, alleen-lezen; beheer gemockt | geen overflow; resterend <44px: — |
| Fotowizard categorie | `/van-gelder/2026/0313990-nieuweweg-38-hattem` | 320, 390, 430, 740 liggend 740×360 | echte data, alleen-lezen | geen overflow; resterend <44px: — |
| Voorbeeld lightbox | `/van-gelder/2026/0313990-nieuweweg-38-hattem` | 320, 390, 430, 740 liggend 740×360 | echte data, alleen-lezen | geen overflow; resterend <44px: — |
| NotitieSheet toetsenbord-sim | `/van-gelder/2026/0313990-nieuweweg-38-hattem` | 320, 390, 430, 740 liggend 740×360 | echte data, alleen-lezen | geen overflow; resterend <44px: — |
| Station ingevuld | `/van-gelder/2026/0318770-halfjebruin-heerde` | 320, 390, 430, 320 zoom130% | echte data, alleen-lezen | geen overflow; resterend <44px: — |
| Opleveren | `/van-gelder/2026/0318770-halfjebruin-heerde/opleveren` | 320, 390, 430, 320 zoom130% | echte data, alleen-lezen | geen overflow; resterend <44px: — |
| Documenten deeplink | `/van-gelder/2026/0318770-halfjebruin-heerde/documenten` | 320, 390, 430, 320 zoom130% | echte data, alleen-lezen | geen overflow; resterend <44px: — |
| Station opgeleverd | `/van-gelder/2026/0320221-nieuweweg-13a-hattem` | 320, 390, 430 | echte data, alleen-lezen | geen overflow; resterend <44px: — |
| Rapport-opener | `/van-gelder/2026/0320221-nieuweweg-13a-hattem` | 320, 390, 430 | echte data, alleen-lezen | geen overflow; resterend <44px: — |
| Beoordelen overzicht | `/beoordelen` | 320, 390, 430 | echte data, alleen-lezen | geen overflow; resterend <44px: — |
| BeoordeelDossier | `/beoordelen/0320221-nieuweweg-13a-hattem` | 320, 390, 430 | echte data, alleen-lezen | geen overflow; resterend <44px: — |
| Cases start | `/cases` | 320, 390, 430, 390 beheer-UI (gemockt), 320 zoom130%, 740 liggend 740×360 | echte data, alleen-lezen; beheer gemockt | geen overflow; resterend <44px: — |
| Cases Weergave Wie moet wat doen | `/cases` | 320, 390, 430, 390 beheer-UI (gemockt), 320 zoom130%, 740 liggend 740×360 | echte data, alleen-lezen; beheer gemockt | geen overflow; resterend <44px: — |
| Cases Weergave TO-score | `/cases` | 320, 390, 430, 390 beheer-UI (gemockt), 320 zoom130%, 740 liggend 740×360 | echte data, alleen-lezen; beheer gemockt | geen overflow; resterend <44px: — |
| Cases Uitvoering Alle 55 | `/cases` | 320, 390, 430, 390 beheer-UI (gemockt), 320 zoom130%, 740 liggend 740×360 | echte data, alleen-lezen; beheer gemockt | geen overflow; resterend <44px: — |
| Cases Uitvoering TerreVolt 25 | `/cases` | 320, 390, 430, 390 beheer-UI (gemockt), 320 zoom130%, 740 liggend 740×360 | echte data, alleen-lezen; beheer gemockt | geen overflow; resterend <44px: — |
| Cases Uitvoering Van Gelder 30 | `/cases` | 320, 390, 430, 390 beheer-UI (gemockt), 320 zoom130%, 740 liggend 740×360 | echte data, alleen-lezen; beheer gemockt | geen overflow; resterend <44px: — |
| Cases actiemenu | `/cases` | 320, 390, 430, 390 beheer-UI (gemockt), 320 zoom130%, 740 liggend 740×360 | echte data, alleen-lezen; beheer gemockt | geen overflow; resterend <44px: — |
| Case toevoegen dialoog | `/cases` | 320, 390, 430, 390 beheer-UI (gemockt), 320 zoom130%, 740 liggend 740×360 | echte data, alleen-lezen; beheer gemockt | geen overflow; resterend <44px: — |
| Excelimport preview | `/cases` | 320, 390, 430, 390 beheer-UI (gemockt), 320 zoom130%, 740 liggend 740×360 | echte data, alleen-lezen; beheer gemockt; fictieve geplakte rijen, geen import | geen overflow; resterend <44px: — |
| CaseDetail TerreVolt | `/cases/0295546-jasmijnstraat-3-vaassen` | 320, 390, 430 | echte data, alleen-lezen | geen overflow; resterend <44px: — |
| CaseDetail Van Gelder | `/cases/0318921-marktstraat-heerde` | 320, 390, 430 | echte data, alleen-lezen | geen overflow; resterend <44px: — |
| CaseDetail opgeleverd | `/cases/0320221-nieuweweg-13a-hattem` | 320, 390, 430 | echte data, alleen-lezen | geen overflow; resterend <44px: — |
| Instellingen | `/instellingen` | 320, 390, 430, 390 beheer-UI (gemockt) | echte data, alleen-lezen; beheer gemockt | geen overflow; resterend <44px: Primaire knop |
| Categoriebeheer | `/instellingen/categorieen` | 320 beheer-UI (gemockt), 390 beheer-UI (gemockt), 430 beheer-UI (gemockt), 390 beheer-UI (gemockt) | echte data, alleen-lezen; beheer gemockt | geen overflow; resterend <44px: × |
| Opdrachtgever | `/van-gelder` | 320, 390, 430 | echte data, alleen-lezen | geen overflow; resterend <44px: — |
| Jaarlijst | `/van-gelder/2026` | 320, 390, 430 | echte data, alleen-lezen | geen overflow; resterend <44px: — |
| Korte link | `/van-gelder/2026/0295546-jasmijnstraat-3-vaassen` | 320, 390, 430 | echte data, alleen-lezen | geen overflow; resterend <44px: — |
| 404 | `/bestaat-zeker-niet/x/y/z` | 320, 390, 430 | echte data, alleen-lezen | geen overflow; resterend <44px: — |

Alias/korte link: `/stations/{uuid}` en `/c/0295546` gaven het canonieke scherm (replace-redirect). 404 getoond voor onbekende diepe route.

## Bevindingen vóór → na
1. Startpagina 320px: "Cases"-knop overlapte de titel "Stations"; knoppen Cases/Beoordeling 40px hoog en Instellingen kromp tot 22–43px breed → Cases-tekst onder 360px verborgen (icoon + aria-label blijft), knoppen 44px hoog/breed, `flexShrink:0`. Screenshot hercontrole: geen overlap.
2. Nieuw station: schakelaars Vermogensveld/DA-kast 52×32 → tikvlak 52×44 (zelfde uiterlijk).
3. NotitieSheet-snelkeuzes 36px → 44px.
4. Case toevoegen: uitvoerderkeuze 40px → 44px; hoofdknop 40px → 48px.
5. Instellingen: Terug-knoppen, Reset, kleurpresets, tekstvelden, SharePoint "Nu volledig synchroniseren"/"Opnieuw controleren" (nu ook terugloop bij smal scherm), header-logo/instellingenknop → ≥44px.
6. Categoriebeheer: Terug, zoekveld, filters Alle/Met foto/Leeg, bewerk- en Foto/Meer-knoppen → ≥44px.

## Resterende meldingen (bewust niet gewijzigd)
- Nieuw station: invoervelden meten 24px, maar het hele `<label>`-rij (≥60px) is het tikvlak → geen probleem.
- BeoordeelDossier/NotitieSheet: elementen "buiten viewport" zijn horizontaal scrollbare filter-/thumbnailstroken, geen paginaoverflow.
- Zoom 130%-variant: "buiten"-meldingen bij menu's zijn een meetartefact van CSS-zoom; screenshots tonen menu's binnen beeld.
- Instellingen "Primaire knop" 105×28 is een niet-interactief kleurvoorbeeld.
- Categoriebeheer: verwijderkruisje voorbeeldfoto 16×16 op een 56px-thumbnail; vergroten vergt herontwerp. Bovendien staat die verwijdervraag nog binnen de lijst (afwijking van de afspraak "geen AlertDialog in loops") — niet aangeraakt.

## Uitgevoerde commando's
- `python3 scripts/mobile-ui-check.py` (definitieve kandidaat, volledige route-smoke): exit 0, 159 metingen, 0 overflow.
- `npx tsgo -b --noEmit`: geslaagd. `bunx vitest run`: 33 bestanden/275 tests geslaagd (5 lokale-PostgreSQL-bestanden overgeslagen, geen DB-wijziging). `npx vite build`: geslaagd.
- Geen nieuwe unit-tests: alle fixes zijn alleen afmetingen (geen beslislogica); bewijs is de browsermeting.

## Screenshots
Lokaal: `/tmp/browser/mobiel/*.png` (+ `resultaat.json`), kopie in Files: `mobiele-ui-check/`.

## Beperkingen / niet getest
- Geen fysiek iPhone/Android; toetsenbord gesimuleerd met 55% viewporthoogte; geen echte camera, iOS-tekstgrootte (130% CSS-zoom als benadering) of safe-area-notch.
- Niet in de browser met specifieke staten: deels ingevuld station, afgekeurd/herindiening, goedgekeurd dossier, multi-station-keuzelijst, upload-/wachtrijfouten, Opleveren-succes/fout, Excel paginering/pauze/retry, BeoordeelDossier afkeurreden/herstel/afronden-dialoog, hold/hervatten-formulieren en TO-ronde-formulieren (wel route geopend). Deze zijn gedekt door bestaande unit-/componenttests, niet door deze meting.
- Lege/foutstaat startpagina niet nagebootst (echte data heeft stations).
- Focusterugkeer alleen eerder gecontroleerd (Meer → Escape); hier niet opnieuw per overlay.
