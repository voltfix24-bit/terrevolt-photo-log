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

## Correctie-/acceptatieronde (op a9b61a8)
### Opgeloste problemen
- Dialogen, PIN-venster en onderbladen volgen nu de zichtbare viewport (`--vvh/--vvt/--vvb`, `src/lib/viewport.ts`), zijn begrensd en scrollen intern; PIN-venster heeft `role=dialog`, Escape en 48px-knoppen.
- SharePoint-sleutelbanner staat bovenaan in de flow (sticky, header schuift eronder), contrast #9A4300/#B71C1C met witte tekst.
- Leesfout ≠ leeg ≠ laden op Startpagina (stations: was "Geen stations gevonden"), Cases, Beoordelen (opdrachtgevers/dossiers), SharePointBeheer (laatste run), Categoriebeheer (voorbeelden) en Opleveren (station/foto's/N.v.t./wachtrij/opdrachtgever; versturen alleen na bevestigde bronnen).
- 404 in het Nederlands met knop "Terug naar stations"; resolver-foutknoppen 44px.
- Wizardtitel breekt af (geen ellipsis), ShareSheet 1 kolom <400px + Escape, lange onbekende Excel-kop breekt af, Excel-ontkoppel- en pagineerknoppen krimpen niet meer onder 44px, select-velden 44px.
- HTML-rapport (PDF bekijken) heeft `width=820`-viewport: hele A4-pagina past in beeld; print-CSS ongewijzigd.
- BeoordeelDossier mobiel: hoogte = zichtbare viewport min de beheerbalk erboven, en de inspectie-inhoud (foto-metadata) was onbereikbaar onder de vaste actiebalk → nu scrollbaar tot boven de balk; balkhoogte gemeten i.p.v. vaste 130px.
- Startpagina 400–479px: "Beoordeling"-label liep buiten beeld → label pas vanaf 480px.
- Voorbeeldfoto-verwijderen: knop 44px, bevestiging nu één AlertDialog buiten de lijst (`deleteTarget`), ook in CategorieSettings.
- OnHold-keuzes 44/48px; jaarchips 44px; afrondscherm-sluitknop 44px; kleurvoorbeeld "Primaire knop" is aria-hidden/niet focusbaar.

### Passgates
- `scripts/mobile-ui-check.py`: route-smoke (159 metingen); exit 1 bij niet-gevonden klikdoel, JS-pagefout, paginaoverflow, invoer <16px, element buiten beeld (behalve in horizontaal scrollbare stroken) of tikvlak <44 (invoer telt via zijn label-tegel). 130% zoom = 246px-viewport (geen CSS-zoom-artefacten meer).
- `scripts/mobile-ui-acceptatie.py <station|beoordelen|cases|overig>`: gerichte overlays/staten; elke stap faalt hard als titel/overlay ontbreekt. Meet per stap paginaoverflow, materiële clipping (tekst buiten beeld, icon-ligaturen uitgezonderd), tikvlak <44 (exacte allowlist: placeholder "bv. …", kleurvoorbeeld, thumbnails "Foto n: …"), invoer <16px, JS-fouten, dialoogrand binnen zichtbare viewport, titel bereikbaar bovenin, laatste actie bereikbaar na scrollen, en BeoordeelDossier: laatste inhoud boven de actiebalk.
- Maten: 320×568, 390×844, 430×932, liggend 740×360, 130% zoom (246×437); toetsenbord gesimuleerd met 55% hoogte.

### Resultaat (definitieve run, alle exit 0)
| Groep | Metingen | Gedekt |
|---|---|---|
| station | 58 | EditStationDialog (+toetsenbord), Delen-sheet, PDF/HTML-rapport, NotitieSheet (+toetsenbord), wizard lange titel, deels/afgekeurd-herindiening/goedgekeurd/foto-leesfout, echte IDB-wachtrij open+mislukt, Opleveren onvolledig/gereed/succes(gemockt)/fout/foto- en stationleesfout |
| beoordelen | 39 | inspectie/raster/onderkant, afkeur-sheet (Anders, toetsenbord), afkeur-afhandelen, eindcontrole, opdrachtgevers-leesfout + herladen |
| cases | 28 | Case toevoegen, Excel lange kop/120 rijen/pagina 2/import gepauzeerd met per-rijresultaat (gemockt), OnHold-dialoog, CaseDetail on hold + afgekeurde TO-ronde, Cases-leesfout |
| overig | 51 | PIN-fout (+toetsenbord), Instellingen (+toetsenbord), categorie-editor, voorbeeld-verwijderbevestiging, sleutelbanner bijna/verlopen, stations-/categorie-/SharePoint-run-leesfout, multi-station-keuzelijst, 404, oude alias → canonieke url, categorie-deeplink + sluiten |
| route-smoke | 159 | alle routes zoals hierboven |

### Databron en blokkering
- Echte data alleen-lezend. Fictieve toestanden ontstaan uitsluitend in de testbrowser door responses te patchen/vervangen (statussen, afgekeurde foto, hold, afgekeurde ronde, sleuteldatum, extra kandidaat "FICT-2", 120 rijen FICT-1000…, case_aanmaken: rij 2 = fictieve verbindingsfout, pin-sessie 401, beheer_status/heeft_beheer = actief, oplever-rapport 200). Wachtrijtest zet 4-byte nepblobs in IndexedDB van de testbrowser en ruimt ze op.
- Exacte leesallowlist: GET/HEAD; RPC beheer_status, url_candidates, heeft_beheer, fotowerk_toegestaan, case_wv_suggesties, dossier_eindcontrole; functie sharepoint-documenten; opleverketen alleen `actie=status`. Al het andere → 503 in de browser. Geblokkeerd tijdens de runs: `POST oplever-rapport` (foutpad), storage-uploads `q_…jpg` van de nepblobs. Geen enkel schrijfverzoek bereikte de backend.
- Tests: `bunx vitest run` 34 bestanden / 286 tests geslaagd (5 lokale-PostgreSQL-bestanden overgeslagen), waaronder `src/test/mobiele-leesfouten.test.tsx` (opleverGereedheid, Opleveren- en Beoordelen-leesfouten). `tsc --noEmit -p tsconfig.app.json` en `vite build` geslaagd.
- Screenshots + resultaat.json per groep: Files `mobile-ui-acceptatie/` (lokaal `/tmp/browser/acceptatie/`).

## Resterende meldingen (bewust niet gewijzigd)
- Nieuw station: invoervelden meten 24px, maar het hele `<label>`-rij (≥60px) is het tikvlak → geen probleem.
- BeoordeelDossier/NotitieSheet: elementen "buiten viewport" zijn horizontaal scrollbare filter-/thumbnailstroken, geen paginaoverflow.

## Uitgevoerde commando's
- `python3 scripts/mobile-ui-check.py` (definitieve kandidaat, volledige route-smoke): exit 0, 159 metingen, 0 overflow.
- *Historie (eerste ronde a9b61a8, achterhaald):* 33 bestanden/275 tests. Actuele stand: zie Eindstand.

## Eindstand (twee laatste correcties, op 921a4d8)
1. **Rapportpreview:** viewport `width=device-width`; alleen `.rapport` (A4-pagina's) krijgt op schermen <820px `zoom = breedte/820`; print zet `zoom:1`. "Opslaan als PDF" blijft op echte maat (16px, min. 48px hoog). Foto-script en printlayout ongewijzigd; golden bijgewerkt met uitsluitend deze wijziging.
2. **Laagvolgorde:** SharePoint-sleutelbanner z-index 60 → 45: boven AppHeader-inhoud (die onder `--banner-h` begint), onder Dialog/AlertDialog/Sheet/Drawer en hun backdrop (z-50, portals na de app), NotitieSheet (z-120) en PIN (z-200). Bannerhoogte/headeroffset en tekst ongewijzigd.

Gerichte checks (sanitized: `mobile-ui-eindcheck.json`):
- `python3 scripts/rapportpreview-check.py`: exit 0. 320×568 en 390×844: visualViewport.scale 1, scrollWidth = breedte, knop 48px effectief, tekst 16px effectief, A4-pagina binnen beeld; print-zoom 1.
- `python3 scripts/mobile-ui-acceptatie.py laag`: exit 0. Banner (verlopen) + Case toevoegen op 320×568 en 340×234: titel en Sluiten via hit-test bovenop, dialoog binnen beeld met interne scroll, laatste CTA na scroll bereikbaar, gesloten zonder opslaan, geen schrijfverzoeken. Gegenproef met z-index 60: beide maten FOUT (gate werkt).
- PDF/golden-regressies (modulariteit + fase2): 29 geslaagd. `tsgo --noEmit` en `vite build` geslaagd.
- Definitieve stand: 335 eerdere mobiele metingen (159 route + 176 gericht) + 2 laagmetingen + 4 rapportmetingen; 286 tests (eerdere volledige run, niet herhaald).

## Screenshots
Lokaal: `/tmp/browser/mobiel/*.png` (+ `resultaat.json`), kopie in Files: `mobiele-ui-check/`.

## Beperkingen / niet getest
- Geen fysiek iPhone/Android: toetsenbord = 55% viewporthoogte, 130% zoom = 246px-viewport, geen echte camera of safe-area-notch.
- Fictieve toestanden zijn browser-patches op echte leesresponses, geen databaserijen; RLS/autorisatie is daardoor niet in deze meting getest (wel in eerdere lokale DB-tests).
- Succespaden van schrijfacties (opleveren, import) zijn alleen met gemockte antwoorden getoond; afkeuren/afhandelen/afronden zijn geopend maar niet verstuurd.
- Focusterugkeer niet per overlay gemeten; Escape sluit elke geteste overlay.
- Rapportpreview gemeten in Chromium; CSS `zoom` op iOS Safari niet op een fysiek toestel gecontroleerd. Volledige suite en overige browsergroepen niet herhaald.
