# Fase 3 — resultaat en verificatie

Startpunt: `6905415272cc1e11c919ba6589d3a7cbc0f0adaa`. Fase-2-verslag `PHASE2-RESULTATEN.md` is ongewijzigd behouden. Frontend nog niet gepubliceerd.

## Reviewcorrecties fase 2

- `sharepoint_wachtrij.aanvraag_id` is een willekeurige UUID, ook na verwijderen/heraanmaken. Een worker legt de versie onder zijn stationclaim vast. Afronding verwijdert alleen die versie; een status-only worker kan geen volledige aanvraag wegboeken. Herhaalde acknowledgements zijn veilig; een nieuwe aanvraag blijft staan. De oude versie-loze RPC weigert afronding, zodat oude workers niet kunnen wissen.
- Scheduler neemt ontbrekende stations mee; `opleverrun_verweesd` beëindigt alleen een werkelijk verweesde actieve run zonder levende workerclaim. Daarna kan SharePoint-cleanup de stationclaim verkrijgen. Geen bestaande zakelijke runs zijn opgeruimd als test.
- Een eigen import-replay voor een inmiddels verwijderde case retourneert `verwijderd`, geen succes en geen heraanmaak. Eigenaarschap blijft gebruiker + aanvraag-UUID + identieke payload, zonder harde sessievergelijking. Een nieuw ontgrendelde eigen sessie mag herhalen. De frontend bewaart `crypto.randomUUID()` per lokale aanvraag; de payloadsleutel zoekt die willekeurige UUID op, maar is niet zelf de aanvraag-ID.
- Wachtrijgrants expliciet ingetrokken voor anon/authenticated, uitsluitend SELECT hersteld. Read-only controle op de echte omgeving bevestigt geen INSERT/UPDATE/DELETE/TRUNCATE/TRIGGER; service_role behoudt zijn serverrechten.

## Cases, scores en gegevens

- `case-presentatie.ts` deelt de presentatie tussen bord, detailheader en scorekolom Bal bij. Van Gelder blijft bij Van Gelder tot TO-goedkeuring, daarna Liander; dossier Afgerond verdwijnt van het bord. On hold levert één kaart bij de gekozen partij.
- Alle drie/open actiepunten blijven behouden, inclusief hun werkelijke eigenaar. De bordkolom verplaatst presentatie, niet opgeslagen indieningspartij of actiehouder. Holdhistorie en acties blijven in het dossier beschikbaar.
- Niet-open rondes zonder indieningsdatum tonen “Indieningsdatum onbekend”; openen/verversen vult niets in. Ook een latere statuswijziging van een reeds ingediende ronde bewaart de onbekende indieningsdatum. Alleen een expliciete nieuwe indiening kan vandaag vastleggen.
- Indieningen tellen alle niet-open rondes. TV één ronde: FTR 100%, gemiddelde 1; VG drie rondes: FTR 0%, gemiddelde 3. Gecombineerde FTR gebruikt tellers/noemers. Gemiddelde indieningen blijft bij filters zichtbaar.
- `useCases` leest `case_overzicht` volledig met keysetpagina’s van 250 tot de echte eindvoorwaarde, zonder limiet 1.000. Per station alleen kaartgegevens, compacte rondestatussen/scorebijdragen, laatste open acties en pauze-intervallen; geen historische dossier-/rondenotities of volledige actiehistorie per kaart.
- `useCase(id)` leest alleen de doelcase met volledige detailrondes, acties en holdhistorie; WV-suggesties komen uit een afzonderlijke distinct-query. Een koude UUID-case heeft in de browser precies twee gerichte stationreads (resolver + detail), geen overzichtsread.
- `url_candidates` levert een kleine passende kandidaatverzameling. SQL-normalisatie is tegen de bestaande JS-normalisatie getest. UUID, korte link, oude casenaam, behuizingsnummer/naam, langste casenummerprefix, meerdere stations en VG-routing blijven bestaan; bestaande sub-/rapportpaden zijn niet gewijzigd.
- De oude offline URL-cache blijft behouden en wordt met bekeken kandidaten samengevoegd. Query-invalidatie omvat overzicht, detail, WV, duplicaten, resolver en stations, ook wanneer het oude overzicht nooit gemount was. Herladen van duplicaten blokkeert een eigen verloren-response-replay niet.

## Holdhistorie en dossiernotities

- `hold_periodes` bewaart begin/einde/reden/partij/verwachte hervatting; een partiële unieke index dwingt één actieve periode af. Alleen bestaande expliciete actieve stationvelden zijn teruggevuld. Geen vrije notities geparseerd, opgeschoond of gewist. Een onbekende historische begindatum blijft onbekend.
- `case_hold_start` gebruikt een stabiele willekeurige periode-ID, vaste Amsterdam-kalenderdatum en stationrijlock. `case_hold_hervat` adresseert de verwachte periode-ID. H1 sluiten → H2 starten → vertraagd H1 sluiten verandert H2 niet. Compatibiliteitsvelden veranderen in dezelfde transactie.
- Import met hold creëert in zijn bestaande transactie precies één periode; replay dupliceert niet en ongeldige import laat niets los achter.
- Doorlooptijd trekt alleen de vereniging van overlappende pauze-intervallen binnen het gemeten interval af. Afgesloten perioden blijven meetellen, dus de teller springt niet omhoog na hervatten.
- Hervatten schrijft nooit meer `dossier_notitie` vanuit een browsersnapshot. De eigen geschiedenis wordt afzonderlijk getoond.
- `dossier_notitie_versie` is een eigen monotonische versie; CAS-mutatie controleert actieve PIN en de verwachte versie. Gewone stationveldwijzigingen geven geen vals notitieconflict. Een extra invoker-trigger blokkeert directe notitie-/holdveldwijzigingen, ook voor een ontgrendelde beheerder.
- Dossiernotities bewaren een lokale concepttekst met versie; opslaan op blur/routeverlaten. Conflict behoudt eigen tekst en biedt expliciet samenvoegen of kantoortekst gebruiken. Verlopen beheer vraagt niet vanuit achtergrondwerk opnieuw PIN. Dit is conceptbewaring, geen nieuwe offline kantoor-mutatiequeue.

## Fotowachtrij, modules en mobiel

- `getQueueCount` gebruikt count-opdrachten binnen één leestransactie. `getQueueCounts` gebruikt uitsluitend index/key-cursors en primaire sleutels; geen waarde-cursor of blobread voor tellen. Geen schema-upgrade nodig: bestaande items blijven intact.
- Index vervangt de drie-seconden-blobpoll door wachtrij-events/focus en behoudt dezelfde state bij ongewijzigde aantallen. Foutitems blijven staan; de bestaande storage+registratiebevestiging en stabiele uploadpaden zijn behouden.
- Excel en ZIP-download worden pas bij gebruik geladen. Offlinekritische fotowerk-/categorienotitiemodules blijven beschikbaar; geen service worker toegevoegd, kill-switch behouden.
- Mobiele correcties: detailgrid maakt geen impliciete tweede kolom; lange case/WV/actiegegevens breken veilig af; importdialoog en bestandsveld passen binnen het scherm; scoretabel scrollt intern met vaste niet-overlappende kolommen; onderste Nieuw station/camera-acties blijven bereikbaar.

## Werkelijk uitgevoerde controles

1. `bun run test:local-pg`: **192 tests geslaagd in 22 bestanden**, waaronder **27 echte PostgreSQL-tests** (12 fase 1, 6 fase 2, 9 fase 3). Eigen tijdelijk cluster, UTF-8-bootstrap en echte migraties 0016–0024; opruiming via runner. Geen productie- of .env-fallback. Bij ontbrekende PostgreSQL-binaries faalt de expliciete opdracht.
2. Gecommitteerde unieke fixtures; twintig onafhankelijke verbindingen met twintig verschillende `pg_backend_pid()`’s en startbarrière. Fase-2-claimwinnaar blijft vastgehouden terwijl verliezers zijn gecontroleerd. Fase 3 gebruikt twintig afzonderlijke lokale beheergebruikers/sessies.
3. Lokale workload: **1.001 cases**, **250 fotoregistraties**, vijf overzichtspagina’s, volledige score gelijk aan referentie inclusief beslissende laatste rij. Laatste run: totaal **822 ms**, twintig gelijktijdige CAS-acties **p50 29 ms / p95 33 ms / max 33 ms**, **0 fouten**. Dit zijn lokale PostgreSQL-metingen, geen bewezen productiebelasting of netwerk-/fotouploadlatenties.
4. `deno test --node-modules-dir=none --allow-env --allow-read --allow-net supabase/functions/rapport-pdf/phase2_test.ts`: **5 tests geslaagd**. Exacte 250 foto-ID’s, ontbrekend/onleesbaar bestand, gelijke PDF-lengte met andere hash; volledig fake opslag/Graph-adapters, geen echte SharePoint-verzoeken.
5. Fake-indexeddb: **250 echte gestructureerd gekloonde lokale bestanden**, blobvrije count/key-cursorreads, events, foutbehoud en verwijdering uitsluitend na done. Native Node Blob/File gebruikt zodat de test niet valselijk JS DOM-Blob-objecten zonder bytes kloont. Bestaande opslag/registratie-retrytests blijven onderdeel van de regressierun.
6. Browser: **Chromium desktop-emulatie op 360/390/428 × 844**, uitsluitend onderschepte fictieve backendgegevens. Doelcase/readback na notitie + direct hervatten, scoretabel, import, lange namen/WV, index-CTA, geweigerde PIN. Eerder geopend station opnieuw zonder netwerk geopend; foto lokaal opgeslagen en categorienotitie behouden. Geen horizontale paginaverbreding, geen pagina-excepties. Screenshots bekeken; geen echte iPhone/hardwaretest.
7. Automatische platform-TypeScript- en buildgate: laatste log **build OK**; één nieuwe testtypingfout is hersteld. **Geen afzonderlijke handmatige frontend-typecheck of productiebuild uitgevoerd**. `git diff --check` geslaagd.

Herhaalbaar: `bun run test:local-pg`, bovengenoemde Deno-opdracht en `python3 scripts/check-phase3-browser.py` (Python Playwright/Chromium beschikbaar; bestaande preview op localhost:8080). Browserscript slaat alleen fictieve screenshots op onder `/tmp/browser/phase3` en onderschept alle backendrequests. PostgreSQL-runner leest nooit productiecredentials.

## Migraties, deployments en kernbestanden

- **0023_phase3_queue_history_projection** en **0024_phase3_url_normalization_compatibility** toegepast. Nieuwe kolommen/tabel read-only bevestigd. Types automatisch vernieuwd. Geen losse zakelijke data-updates/testmutaties op productie; alleen de gevraagde schema-backfill van expliciete actieve holds.
- **Vijf functies succesvol gedeployed**: `opleverketen`, `oplever-rapport`, `rapport-pdf`, `sharepoint-sync`, `sharepoint-weekly`. Gedeelde Claim-helper bevat versiegebonden wachtrijsnapshot/ack. Deploymentresultaat is bevestigd; geen echte oplevering/SharePoint-runtimeactie uitgevoerd om deployment te testen.
- Frontend: `to-rondes.ts`, `case-presentatie.ts`, `case-queries.ts`, `paged-read.ts`, `on-hold.ts`, `DossierNotitie.tsx`, `CaseDetail.tsx`, `Cases.tsx`, `Bord.tsx`, `OnHold.tsx`, `VgVelden.tsx`, `use-url-index.ts`, `UrlRoutes.tsx`, `offline-queue.ts`, `Index.tsx`, `StationDetail.tsx`, `ExcelImportDialog.tsx`, `import-batch.ts`, `case-service.ts`, `App.tsx`.
- Tests: `phase3.db.test.ts`, `phase3-regressions.test.ts`, `dossier-note-phase3.test.tsx`, lokale runner en browserscript. Besluiten bijgewerkt in `AGENTS.md`/`src/AGENTS.md`.

## Concrete grenzen

- Geen echte productiedossiers, gedeelde-account-PIN-login, SharePoint-timeouts of mobiele hardware getest. Lokaal RLS/concurrencybewijs staat los van fake UI-adapters.
- Twintig lokale gebruikers doen gelijktijdige DB-acties; geen twintig volledige browsers met echte uploads. De 250-foto-PDF is via adapters getest, niet via echt storage/SharePoint. Geen general exactly-once-belofte voor externe timeouts.
- Browsercontrole bewijst offline terugkeer binnen dezelfde eerder geopende app; geen koude offline herlaadgarantie zonder service worker.
- Importaanvraag-UUID’s blijven zoals fase 2 in dialooggeheugen; geen hervatting van de importbatch na een volledige browserherlaad toegevoegd. TSV-preview/browser getest; geen nieuwe echte .xlsx end-to-endtest.
- Resolver vermindert netwerkpayload tot kandidaten; server-side prefixnormalisatie kan nog een scan vereisen. Lokale timings zijn geen productie-SLA.
- Frontendpublicatie wacht op onafhankelijke controle. De oude gepubliceerde frontend kan directe notitie-/holdwrites niet meer gebruiken: de nieuwe servergrenzen vereisen de nieuwe frontend. Gewoon monteurfotowerk en fase-1-grants zijn behouden.