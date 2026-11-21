# Correctieronde fase 3 — resultaten

Startpunt: `9531303da97f8bd320dc9aeef04a9d04cd3a6024`. Eerste correctiecommit: `e748e5f441d4116bfc574ca27868db288cc69490`; de aanvullende flow-sweep staat in de nieuwste commit (`git log -1`). `PHASE2-RESULTATEN.md` en `PHASE3-RESULTATEN.md` zijn byte-ongewijzigd behouden. Geen frontendpublicatie uitgevoerd.

## Concrete correcties

1. **SharePoint-inventaris:** volledige keysetpagina's voor stations en syncmapping, inclusief Van Gelder, tot een werkelijk lege pagina. Readfouten breken af; runread, stationsbatch, vorige mapping, inventaris en bestaanscontrole controleren errors. Geen fout wordt een succesvolle laatste batch. Vóór archiveren wordt stationbestaan opnieuw onder de claim gecontroleerd.
2. **Bronrevisie:** `leesSyncBron` leest PDF-pointer, bestand/hash, vorige sync, geaccepteerde run/dossierarrays en benodigde stationselectie vóór metadata-, map- of bestandsmutaties. Een geaccepteerde run vereist haar eigen dossierkopie: ontbrekend/falend/ongeldig geeft een fout, nooit livefallback. Alleen legacy zonder geaccepteerde run gebruikt volledige live foto-/notitie-/skipreads; iedere read moet slagen. Lege en all-NVT dossiers blijven geldig.
3. **Gelijke lengte:** gewijzigde geaccepteerde run/hash herschrijft alle beheerde foto's, NVT-tekst en opmerkingen, ook bij dezelfde bytegrootte. Dezelfde succesvol gesynchroniseerde revisie vermijdt onnodige uploads. Legacy schrijft inhoud opnieuw omdat daar geen vaste dossierrevisie beschikbaar is. Doelnamen en mapbeleid behouden; geen writes naar `10 Documenten`.
4. **Runstaat/cleanup:** de worker herleest de run direct na claimverkrijging en stopt op huidige terminale staat. Late HTML-fouten gebruiken status/PDF-pointer/versie-CAS. Verloren PDF-wakeup zet geen geldige PDF terug naar retry. De algemene verwerkings-RPC weigert terminale runs te muteren; expliciete retry blijft een afzonderlijke beveiligde serveractie. Beide cleanupcallers gebruiken `verwerking_sync_verwijderen`: claimrijlock, eigenaar/generatie/servertijd, stationbestaan en exact mappingitem worden gecontroleerd; error/false/nulrij is geen succes. Queue-aanvraagversies blijven intact.
5. **PDF-vervolg:** cursor, pogingstart, laatste voortgang en volgende stap zijn duurzaam. Nieuwe PDF-pogingen krijgen een verse serverklok, los van de logische opleverstart. Iedere stap bevestigt haar cursor vóór claimvrijgave en snelle selfcall. Bij 409/verloren wakeup blijft het vervolg beschikbaar voor de scheduler. Deze filtert gezonde, nog niet opeisbare PDF-stappen vóór de batchlimiet; actuele gepubliceerde of mislukte uitkomsten blijven bevestigbaar. Immutable revisiepaden blijven behouden.
6. **Notitie-CAS/rechten:** NULL en stale versie conflicteren; alleen een geldige versie schrijft. Stationsinserts normaliseren het systeemversieveld naar nul, ook bij geïnjecteerd bigint-max. Eerste PIN-save wordt versie één. Holdhistorie heeft uitsluitend SELECT-grants voor anon/authenticated en een volledige `(station_id,begin_op,id)`-index; beveiligde serveracties blijven werken.
7. **Lokale concepten:** iedere lokale wijziging krijgt een willekeurig concepttoken. Een oude response bevestigt alleen haar eigen opslagentry, niet een nieuw concept van heropend scherm/andere tab. Alleen bevestigde successen mogen nieuwere tekst automatisch vervolgen. Rejected RPC/sessioncheck stopt na één trigger, bewaart tekst en toont een fout. Samenvoegen, ontgrendelen en routeverlaatbewaring blijven ondersteund.
8. **Schermfouten:** koude UUID-/slug-/korte routes krijgen eindige foutweergave met retry/terug. De resolver mag ook offline proberen zodat een koude link zonder cache geen permanent gepauzeerde lader wordt; bruikbare eerdere cache blijft beschikbaar. Excel-opening vereist internet. Downloadrejection wordt lokaal afgehandeld vóór React.lazy de exception ontvangt, met sluiten/retry en een aanvullende lokale error boundary; Cases/navigatie verdwijnen niet.
9. **Import/operaties:** telling kiest per rij eerst het echte resultaat en pas daarna preview: eigen aangemaakt/replay telt na nummersrefetch niet als bestaand. Onzeker/mislukt verzoek behoudt UUID bij retry. Geslaagde create wist de oude operatie; gesloten/reset importbatch wist aanvraagrefs. Een expliciet nieuwe operatie krijgt een nieuwe willekeurige UUID en kan niet aan een vorige verwijderde-case-tombstone vastzitten. Create heeft try/catch/finally voor exceptionherstel.

## Migraties en deployment

- `0025_review3_durable_pdf_and_fenced_cleanup.sql`: PDF-cursor/klokken, cleanup-RPC, run-CAS/terminale guard, notitie-NULL/insertversie, holdgrants/index.
- `0026_review3_fresh_pdf_attempt_clock.sql`: verse serverpogingklok bij overgang naar PDF-verwerking.
- Beide migraties zijn succesvol toegepast; types vernieuwd. Read-only cataloguscontrole bevestigde vier PDF-velden, historie-index, SELECT-only holdrechten, notitie-NULL-guard en de nieuwe functies. Geen zakelijke dataupdates/backfills in deze correctieronde.
- Deploymenttool bevestigde **opleverketen, oplever-rapport, rapport-pdf, sharepoint-sync, sharepoint-weekly, sharepoint-documenten**. Dit is deploymentbevestiging, geen productieverwerkingstest.

## Werkelijk uitgevoerde controles

| Controle | Werkelijke uitkomst |
|---|---|
| Volledige tijdelijke lokale PostgreSQL/Vitest-run | **212 tests geslaagd in 28 bestanden**, inclusief aanvullende flow-sweep |
| Echte lokale DB-tests binnen bovenstaande telling | **33**: 12 fase 1, 6 fase 2, 9 fase 3, 6 correctieronde |
| PDF/Graph/worker-adapters via Deno | **19 geslaagd**, 5 bestaande + 14 nieuwe; laatste run met `--deny-net` |
| Automatische platform-TypeScript/productiebuildgate | Nieuwste gecontroleerde logentry **build OK**; geen afzonderlijke handmatige frontendtypecheck/build uitgevoerd |
| Mobiel Chromium/Playwright | **360/390/428 × 844**; notitiefout/conceptbewaring, import, offline-opening geweigerd, koude UUID/slug-fout en onderbroken importdownload; geen horizontale paginabreedte en **geen pageerrors** in definitieve run |
| Historische verslagen | `git diff --exit-code` bevestigt beide ongewijzigd |

De lokale DB-run behield de bestaande 1.001-case-/250-foto-/20-onafhankelijke-verbindingenfixtures. Laatste meting: vijf overzichtspagina's, nul fouten, totaal 1.989 ms; twintig afzonderlijke kantooracties p50 28 ms, p95 34 ms, max 35 ms. Dit zijn lokale fixturemetingen, geen productiecapaciteitsclaim.

Nieuwe regressies bewijzen onder meer NULL/stale/geldige CAS, geïnjecteerde insertversie, catalogusrechten/index, verlopen/overgenomen cleanupclaim, verkeerde/nul mappingrij, stale null-PDF en terminale downgrade, twintig gezonde PDF's vóór nieuwe uitvoerbare aanvraag, duurzaam vervolg bij busy/lost-wakeup, remount-conceptrace, rejected RPC/sessioncheck zonder loop, per-rijtelling en aparte versus herhaalde operatie-UUID's. Fake Graph bevestigt 1.002 bestaande IDs inclusief laatste VG-mapping, nul mutaties bij bronfouten, en gelijke-lengte foto/notitie/NVT-bytevervanging. Bestaande exacte 250-foto-ID-set en ontbrekend/onleesbaar-bestandtests zijn behouden.

De standaard edge-testtool liep aanvankelijk vast op npm-module-resolutie. De lokale Deno-opdracht met `--no-config --node-modules-dir=none` werkte vervolgens; de definitieve herhaalbare runner ontzegt runtime-netwerk. Dat eerste toolresultaat is dus niet als geslaagde test meegerekend.

## Herhalen

- `bun run test:local-pg` met lokale PostgreSQL-binaries op PATH. Runner maakt een eigen cluster, bootstrapt en past alle migraties vanaf 0016 toe, test en ruimt de cluster op; faalt zonder lokale PG, geen `.env`/productiefallback.
- `bash scripts/test-review3-deno.sh` — fake Storage/Graph/wakeups, runtime-netwerk geweigerd.
- `python3 scripts/check-review3-browser.py` — alle backendrequests onderschept; afbeeldingen/logs in `/tmp/browser/review3`.

## Kernbestanden

- Server: `_shared/bron-read.ts`, `sharepoint.ts`, `verwerking.ts`, nieuwe testbare `keten-worker.ts`, `opleverketen/index.ts`, `rapport-pdf/index.ts`/`renderer.ts`, `sharepoint-sync/index.ts`, `sharepoint-weekly/index.ts`.
- Schermen: `DossierNotitie.tsx`, nieuwe `dossier-draft.ts`, `ImportScherm.tsx`, `Cases.tsx`, `UrlRoutes.tsx`, `use-url-index.ts`, `ExcelImportDialog.tsx`, `CaseToevoegenDialog.tsx`, `import-batch.ts`.
- Tests/runners: `review3.db.test.ts`, `review3-note.test.tsx`, `review3-import.test.tsx`, `review3-routes.test.tsx`, `review3-import-chunk.test.tsx`, `rapport-pdf/review3_test.ts`, bestaande PDF-adapterfixture, lokale PG/Deno/browserrunners. Technische regels in root `AGENTS.md`; roadmap bijgewerkt.

## Grenzen

- Geen testmutaties of belasting op productie; geen echte SharePoint/Graph-testrequests. Alleen noodzakelijke migraties/deployments en read-only cataloguscontrole.
- Claims/CAS voorkomen stale databasebevestiging; een externe Graph-write die al onderweg is kan niet worden teruggedraaid. Geen algemene exactly-once-garantie bij externe timeouts.
- Browsercontrole is desktop-Chromium met mobiele emulatie, geen echte iPhone/hardwaretest. Onderbroken chunkdownload en foutweergave zijn met de draaiende preview getest; productie-CDN-herstel is niet getest.
- Geen echte productie-PIN/oplevering/Storage/SharePoint-end-to-end uitgevoerd. TSV en aanvraagretry zijn getest; geen nieuwe echte `.xlsx` end-to-endcontrole.
- Importaanvragen/concepten behouden de bestaande opslaggrenzen: import-UUID's staan in dialooggeheugen, niet als herstelbare batch na browserherlaad. Geen service worker toegevoegd.
- Geen frontendpublicatie; laatste onafhankelijke controle en publicatie blijven bij de gebruiker/root.

## Aanvullende flow-sweep

**Regel in gebruikerswoorden:** een leesfout betekent niet dat iets verdwenen of leeg is; alleen bevestigde actuele verwerking mag klaar heten, en een oud antwoord mag nieuw werk niet wissen.

| Plaats waar die regel geldt | Nu gelezen/gecontroleerd | Uitkomst |
|---|---|---|
| Wekelijkse SharePoint-run/inventaris/cleanup | `sharepoint-weekly`, `bron-read`, `verwijderMapping` | Foutveilige volledige inventaris; onder-claim bestaanscontrole; lokale adaptertests behouden |
| Handmatige volledige/status-only sync | `sharepoint-sync`, `station-service`, `SharePointStatus` | Claim/queueversie beschermd; statusreadfouten nu expliciet zichtbaar; rejected handmatige call eindigt via finally |
| Documentlijst en downloaden | `sharepoint-documenten`, `SharePointDocumenten`, gedeelde documentenhelpers | Mappingreadfout werd nog lege lijst: hersteld naar serverfout + zichtbaar schermalert/retry; bruikbare offline lijstcache behouden; nooit writes naar 10 Documenten |
| Opleverreservering en HTML-voorbereiding | `oplever-rapport`, `fotodossier_aanbieden`, `Claim.snapshot/save` | Extra readfoutguards; voorbereiding herleest onder claim, stopt op terminale run en hergebruikt bestaande HTML zonder nieuwe write; signed-url succes wordt bevestigd |
| Rapportlink/legacyresolver | `oplever-rapport` rapport-url, `UrlRoutes.RapportOpener` | Station/PDF/laatste-run-queryerrors vallen niet meer stil terug; scherm meldt onbeschikbaar; oude geldige PDF-pointer blijft leesbaar |
| PDF-ingang/render/vervolg | `rapport-pdf/index`, `renderer`, `pdf_stap_start/klaar`, pogingtrigger | Extra station/active-run-readguards; duurzame stappen/immutable bestanden/verse clocks behouden; Deno-adapters opnieuw geslaagd |
| Centrale scheduler/late fouten/retry | `keten-worker`, `opleverketen`, `uitvoerbare_opleverruns`, `verwerking_run_cas/opslaan`, `opleverrun_retry` | Actuele staat na claim, terminale guard, cursorselectie en fenced acknowledgements; echte lokale DB-/concurrencyregressies behouden |
| Vrije dossiernotitie/heropenen | `DossierNotitie`, `dossier-draft`, `case_notitie_opslaan` | Oud lokaal concept zonder token kreeg per read ander token: eenmalige stabiele tokenupgrade toegevoegd; bevestigd-save-test houdt bestaande tekst intact en wist alleen de juiste entry |
| Categorienotitie/offline achtergrondqueue | `notities`, relevante `NotitieSheet` save/unlock/errorpaden | Versiecheck na await; fout bewaart entry; achtergrondqueue vraagt geen PIN en stopt per mislukte versie; niet gewijzigd |
| Foto-upload/verwijderen/skip/queue | `fotos-service`, `sync-service`, `station-service`, `useSkippedCategories` | Read-/targetbevestiging vóór delete/succes, stabiele paden, bestand/queuebehoud bij fout; bestaande tests behouden; niet gewijzigd |
| Import/create/duplicaten | `case-service`, `import-batch`, create/importdialogen, `case_aanmaken` | Eigen UUID/payload, expliciete resultaten en volledige nummers; responseverlies/new-operation-tests behouden; geen zakelijke records herschreven |
| Hold/hervatten | `on-hold`, bestaande hold-RPC's en dedicated note guard | Verwachte periode-ID en onafhankelijke notitieversie; concrete lokale tests ongewijzigd behouden |
| Koude/voorheen geopende routes en importdownload | `use-url-index`, `UrlRoutes`, `ImportScherm`, relevante Cases-opening | Eindige fout, offline cache, lokale chunkfallback; definitieve mobiele emulatie uit hoofdcorrectieronde behouden |

Na deze sweep: **212 Vitest-tests / 28 bestanden, 33 echte lokale DB-tests en 19 Deno-adaptertests geslaagd**; automatische TypeScript/buildgate opnieuw `build OK`. Deploymenttool bevestigde de opnieuw gewijzigde **oplever-rapport, rapport-pdf en sharepoint-documenten**. Geen nieuwe migratie nodig, geen gewijzigde autorisatie, instellingen of voorbeelddata en geen bewerking van afgehandelde dossiers.

De aanvullende serveringangs-guards zijn gelezen en gedeployed, maar niet met productieverzoeken uitgevoerd. De nieuwe document-/statusalerts en legacy-conceptupgrade hebben lokale UI-regressies; geen aanvullende hardware- of mobiele browsercontrole specifiek van die twee kleine SharePoint-alerts. Alle eerder genoemde beperkingen blijven van kracht.