# Fase 2 — implementatie en verificatie

## Geleverd
- Migraties **0020–0022** toegepast, nieuwe velden read-only gecontroleerd. Geen zakelijke data herschreven.
- Eén gedeelde stationclaim met eigenaar, generatie en databasedeadline; conditionele bevestiging en vrijgave. Reservering maakt de actieve run vóór station-/fotowrites; vaste dossierkopie bevat foto-ID's, immutable bronpaden, gegevens, vereisten, skips en rapportrevisie.
- PDF/cache onder `revisies/{run}` met immutable uploads, exacte verwachte/ingesloten ID-set en conditionele pointer. Vorige goede PDF blijft beschikbaar bij nieuwe fout; resolver ondersteunt legacybestanden.
- SharePoint gebruikt geaccepteerde revisie en SHA-256, niet alleen bytegrootte. Requests begrensd; claimcontrole voor/na externe writes. Bezet/mislukt werk blijft in duurzame wachtrij, hervat door bestaande tienminutenketen. Geen writes naar `10 Documenten`.
- Import via `case_aanmaken` naar bestaande atomaire `maak_case`: eigen aanvraag-ID + payloadcontrole, expliciet aangemaakt/replay/bestaat/mislukt. Alle bestaande nummers opgehaald; pagina's van 100 previewrijen; pauze op netwerk/PIN-fout en alleen resterende aanvragen hervatten. Gedeelde validatie en TSV-parserfoutcontrole.
- Alle fase-1-PIN-/RLS-/notitie-/wachtrijgrenzen behouden.

## Kernbestanden
`supabase/functions/_shared/verwerking.ts`, `_shared/sharepoint.ts`, `oplever-rapport/index.ts`, `rapport-pdf/index.ts` + `renderer.ts`, `opleverketen/index.ts`, `sharepoint-sync/index.ts`, `sharepoint-weekly/index.ts`; `src/lib/case-service.ts`, `case-validatie.ts`, `case-import.ts`, `import-batch.ts`; import-/case-dialogen, `SharePointStatus.tsx`, `OpleverStatus.tsx`.

## Echt uitgevoerd
- **166 Vitest-tests geslaagd**, 19 bestanden, inclusief **18 echte lokale PostgreSQL-tests** (12 behouden fase-1-tests en 6 fase-2-tests).
- Fase-2-concurrency: gecommitteerde unieke fixtures, **20 onafhankelijke verbindingen en 20 verschillende `pg_backend_pid`s**, startbarrière, gewonnen claim blijft vast tot alle verliezers zijn gecontroleerd. Aanvraagrace, claimovername, pointerfencing, replay/payloadconflict, andere gebruiker, ronde3/null-datum, serverqueuefairness, nul-rijretry.
- Storagefixture heeft echte `(bucket_id,name)`-uniciteit; echte `uploadEnRegistreer` via lokale SQL-adapter bevestigt duplicate-upload/registratie.
- **5 Deno-tests geslaagd**, inclusief echte pdf-lib-opbouw met **250 exacte foto-ID's**, ontbrekende/onleesbare foto, categorie31/NVT en gelijke PDF-lengte met verschillend hash via fake Graph-adapter. Geen echte SharePoint-verzoeken.
- `deno check` geslaagd voor de gewijzigde verwerkingsingangen; Deno-PDF-tests typen ook de renderer en gedeelde logica.
- Platform TypeScript/buildgates: laatste controle `build OK`. **Geen afzonderlijke handmatige frontend-typecheck of productiebuild uitgevoerd**.
- Playwright: echte importdialoog met uitsluitend lokale netwerkadapters; rij501 bereikbaar; stoppen na PIN-fout op rij3; hervatting met dezelfde request-ID; succesvolle rijen niet opnieuw verstuurd; 501 adapter-bevestigingen.
- Zes functies gedeployed: oplever-rapport, rapport-pdf, opleverketen, sharepoint-sync, sharepoint-weekly, sharepoint-documenten. Rapport-pdf daarna opnieuw gedeployed met renderer als aparte module.
- Herhaalbare opdracht: **`bun run test:local-pg`**. Vereist lokale PostgreSQL-binaries, start eigen socketcluster, bootstrap + echte migraties 0016–0022, voert alle tests uit, verwijdert eigen cluster. Faalt als lokale PG ontbreekt; geen productie/.env-fallback.

## Grenzen van bewijs
- Geen volledige hosted PIN→Storage→PDF→SharePoint-flow uitgevoerd: dit zou echte dossiers of SharePoint wijzigen. Schermflow gebruikt adapters; dat is geen hosted-RLSbewijs. Lokale DB-tests zijn wel echte PostgreSQL/RLS, geen mocks.
- PDF-test gebruikt 250 kleine leesbare beelden; geen belasting-/CPU-/geheugenbewijs voor 250 grote productiebeelden.
- Externe timeouts blijven ambigu: eigenaarfencing voorkomt stale DB-success maar kan een al onderweg zijnde SharePoint-write niet terughalen; geen exactly-once-garantie.
- Geen volledige endpoint-crash/herstart- en Amsterdam/DST-weekflow met hosted runtime uitgevoerd. Bestaande planning behouden.
- Bronpaden zijn fase-1-immutable; bronbytes niet vooraf gekopieerd/gehasht. Verwijderde/onleesbare bronnen falen expliciet. Geen test dat een externe beheerder buiten de app bronbytes verandert.
- TSV schermflow bewezen; geen echte gebruikers-.xlsx met herhaalde/lege cellen en Excel-getalopmaak end-to-end getest.
- Request-ID's/resultaten blijven in het geopende dialooggeheugen; geen herstel na volledige browserherlaad/crash. Een ongewijzigde resterende rij binnen dezelfde importsessie behoudt haar ID.
- Nog niet opnieuw gepubliceerd door deze fase-2-ronde. Performance/caseprojectie/holdhistorie blijven fase3.