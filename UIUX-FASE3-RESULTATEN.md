# UI/UX fase 3 — Cases & TO + verplichte reviewcorrecties fase 1 en 2

Startpunt `4f7e664`. Geen frontendpublicatie, geen productiemutaties, geen SharePoint-requests, geen migraties of function-deployments in deze ronde.

## Prompt 3 — Cases & TO
- **Statusbetekenis**: casepagina toont naast elkaar *Uitvoering*, *TO-status* en *Dossier*; "Bal ligt bij" → **"Bal bij"**; afwijkende actiehouder als **"Actie bij: …"** (bord, aandachtlijst, casekop). Bordlabel uitvoering `Uitv. TerreVolt/Van Gelder` (aria "Uitvoering …").
- **Routing** blijft uit `casePresentatie` (VG bij Van Gelder tot TO-goedkeuring, daarna Liander tot dossier Afgerond; on hold bij gekozen partij). Liander-groep heet "TO goedgekeurd · dossier nog niet afgerond".
- **Tellingen**: kolomkop "`n` acties · `m` cases open" (`groepenVan` geeft `open` = actiekaarten, `openCases` = unieke `station.id`). KPI-uitleg "Zie TerreVolt en Derden" vervangen door telling per uitvoering.
- **Aandachtlijst** (`src/lib/aandacht.ts`): afkeur oplossen, hervatten nodig, dossier afronden; casenummer, actie, Bal bij / Actie bij, datum/duur, uitvoeringslabel. Hervatten te laat alleen als `on_hold_tot` < vandaag (Europe/Amsterdam); vandaag/onbekend niet. Rode 10-dagenindicatie gemarkeerd als indicatie (title), geen deadline.
- **Mobiel**: compacte kop (terug, titel, actiemenu "Meer acties" met toevoegen/import/verborgen); tabs in pagina; directe **partijkeuze met aantallen** (`?partij=` in URL, los van uitvoerderfilter in localStorage); mobiel één werklijst. TO-score mobiel als kaarten (casenummer, TO-status, dossier, Bal bij, rondes). Per-uitvoerder-score toont alleen uitvoerders binnen het filter (geen valse nulkaart); FTR-/indieningsformules ongewijzigd.
- **Casepagina mobiel**: volgorde huidige ronde → opleverdossier → ingeklapte "Eerdere rondes (n)" → samenvatting → verbergen (wrappers `max-lg:contents`). Notities, holdhistorie en actiepunten behouden.
- **Import**: header / scrollend middendeel / vaste footer met telling, Annuleren en importknop (48px, safe-area). Per-rij-resultaten, requestidentiteit, pauze/hervat en laadfoutgrens ongewijzigd.
- **Leesbaarheid**: `T.subOnBg`/`T.rowSub` #5E7A66/#7A857A → #4E6656 (5,43:1 op bg, 6,25:1 op wit); oranje #B5541A → #9A4A06; hold-te-laat #C2610C → #9A4A06; BeoordeelDossier `sub` #4A6352, `rowSub` #4F5B50, "Te beoordelen"-tekst #8A5410, "Dossier afronden…" op licht oker met donkere tekst. TO-accenten ongewijzigd. Rondeblokjes hebben nummer + aria-label "Ronde n: status". Dialoog-/sheetkruisjes 44×44 ("Sluiten"), actiepuntvinkjes 44×44 (role=checkbox), bordgroepen/Toon meer/chips/Ontgrendelen/On hold ≥44px; wizard Notitie/N.v.t./Toch foto/Info 48px. Mobiele invoer ≥16px via CSS `!important`; zichtbare `:focus-visible`-outline op invoer.

## Correcties review fase 1 (BeoordeelDossier)
- A: `UrlRoutes` rendert `BeoordeelDossier`/`CaseDetail` met `key={station.id}`; binnen het scherm stations- en lijstgeneratie; operaties nemen `{stationId, generaties}` mee, controleren na de PIN-await en sturen niets bij gewijzigde context; gecommitteerde resultaten werken alleen UI van de actieve context bij; `Laatste` bevat `stationId`; invalidatie incl. `['fotos', stationId]` en SharePoint-statusupdate op het oorspronkelijke station; unmount maakt lopende operaties inactief.
- B: `toegestaneActies` stuurt knoppen én A/X; open afkeur alleen "Afkeur afhandelen…". `sneltoetsToegestaan` vereist een aanwezige regio (en een zichtbare foto), weigert body zonder regio, andere knoppen/thumbs/links, invoer en dialogen.
- C: verzonden maar onbevestigd → "Geen bevestiging … mogelijk wél opgeslagen", ververs het oorspronkelijke dossier (CAS beschermt herpoging). Samengeplakte bullets in `src/AGENTS.md` gescheiden.

## Correcties review fase 2 (wachtrij)
1. Vreemde geldige lease → één gerichte timer op vroegste verloop (`planHerpoging`), geen polling.
2. `getDB`: gedeelde open-promise, `blocked` → melding (toast blijft tot opgelost), `blocking` → eigen verbinding sluiten, `terminated` → reset; nooit wissen.
3. Na duurzame enqueue de actuele `navigator.onLine` gebruiken.
4. `markDone`/`markError` één readwrite-transactie met eigenaarcontrole (alleen als er een lease is genomen).
5. Legacy-item zonder pad: eerst `geregistreerdWachtrijPad` (`q_{id}.*`, elke extensie); hergebruik, geen nieuwe compressie/rij.
6. `useWachtrijCategorie`: sleutel station+categorie + generatie; verouderde reads/unmount nemen geen state/refs over; bij wissel nooit oude tegels.
7. Verstuurde tegel blijft "Verstuurd" tot serverlijst het pad bevat; `SYNC_RESULTAAT_EVENT` per item → App invalideert precies dat station.

## Uitgevoerde verificatie (exact)
- `bash scripts/test-local-pg.sh` (wegwerp-PostgreSQL in /tmp, migraties 0016+): **35 bestanden, 275 tests geslaagd**.
  - Nieuw: `uiux-fase3-wachtrij` (9), `uiux-fase3-hydration` (2), `uiux-fase3-beoordeling` (9), `uiux-fase3-cases` (9), en DB-test "real valid resubmission via fotodossier_aanbieden …" in `fotobeoordeling.db.test.ts`.
  - Aangepast: `fotobeoordeling.test.tsx` (sneltoets zonder regio nu geweigerd — reviewbesluit), `review3-import-chunk.test.tsx` (tab-rol en twee "Sluiten"-knoppen), sync-signatuur met eigenaar.
- `tsgo -b --noEmit`: geen fouten. `vite build`: geslaagd (bestaande chunkgroottewaarschuwing).
- Headless Chromium met onderschepte netwerkverzoeken (fictieve data, alle schrijfverzoeken geblokkeerd met 403) op 360/390/428/1280 px voor Cases (lijst, score), import met 100 regels, casepagina en BeoordeelDossier: 0 tikvlakken <44px, 0 tekstparen onder 4,5:1 (berekend op werkelijk gerenderde kleur + eerste opake achtergrond), invoer 16px, geen horizontale paginascroll en geen elementen buiten beeld buiten scrollcontainers, importfooter binnen viewport met scrollend middendeel (3938 vs 551 px), casevolgorde huidige ronde < dossier < historie op mobiel, zichtbare focus-outline (2px solid).

## Grenzen
- **Herindiening na afkeur vereist PIN**: `foto_beoordelen` zet bij afkeur `status='in uitvoering'` maar laat `submitted_at` staan; daardoor weigert `fotodossier_aanbieden` (en foto-uploads) zonder beheer. Dit volgt de fase-1-regel "wijzigen van een opgeleverd dossier vereist PIN"; de DB-test bewijst weigering zonder PIN en geldige herindiening met PIN. Wil je monteurs zonder PIN laten herindienen na afkeur, dan is een schemabesluit nodig.
- IDB-upgrade, leases en tabs getest met fake-indexeddb; geen echte multi-tab/iOS Safari-test. Wizard niet opnieuw in de browser gemeten (maatvoering in code gezet en in jsdom-tests behouden). Geen echte uploads, Storage/RLS-uploads via browser of SharePoint.
- Contrastmeting dekt de gemeten schermen; disabled-knoppen en decoratieve iconen uitgesloten.
- Mobiele casekop kan bij lange casenummers naar twee regels lopen (gemeten 109 px op 360 px).
