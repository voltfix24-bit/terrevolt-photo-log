# UI/UX fase 1 — Fotobeoordeling betrouwbaar en efficiënt

Startpunt `93a37b1`. Historische PHASE2/3- en correctierapporten zijn niet gewijzigd.

## Migratie
`drizzle/migrations/0027_uiux1_fotobeoordeling.sql` (toegepast op Lovable Cloud):
- `fotos`: `review_versie` (trigger-beheerd, client kan niet vervalsen), `afkeur_afgehandeld_op`, `afkeur_afgehandeld_toelichting`. Geen backfill of herclassificatie van bestaande afkeuren.
- `foto_beoordelingen`: herleidbare historie (oud/nieuw foto- en stationstatus, versie, gebruiker, sessie). Alleen SELECT met actieve beheergrant; geen directe writes voor anon/authenticated.
- RPC's (actieve PIN-grant via `heeft_beheer()`, alleen TerreVolt):
  - `foto_beoordelen(foto, verwachte versie, approved|rejected|afgehandeld, reden)` — CAS op versie; afkeuren heropent de taak zoals voorheen.
  - `foto_beoordeling_herstellen(beoordeling)` — alleen eigen beslissing in dezelfde sessie, alleen als foto ongewijzigd is; station wordt alleen teruggezet als het sindsdien niet veranderde.
  - `dossier_eindcontrole(station)` (lezen) en `dossier_afronden(station)` — te beoordelen, open afkeuren en ontbrekende vereiste onderdelen (centrale `vereiste_fotocategorieen` + geldige N.v.t.) blokkeren; all-N.v.t. zonder foto's is geldig.
- `fotodossier_aanbieden` zet afgekeurde foto's niet meer terug naar "te beoordelen"; `dossier_snapshot` sluit afgekeurde foto's uit (PDF/SharePoint lezen de snapshot; geen edge-deployment nodig).

## Frontend
- `src/pages/BeoordeelDossier.tsx` herschreven: inspectieweergave (groot volledig beeld, zoom/pan via lightbox-Zoom, "Foto n van m", thumbnails, vaste acties; op mobiel vaste onderbalk), raster blijft als overzicht, filters "Te beoordelen / Alle / Goedgekeurd / Open afkeuren / Afgehandelde afkeuren / N.v.t." en categorieën.
- Selectie altijd binnen actief filter; na bevestigde beslissing naar volgende passende foto; lege-, laad-, leesfout- en voltooid-toestanden apart; leesfout blokkeert alle acties.
- Eén beslisslot vóór de PIN-await (geen dubbele klik/A/repeat). Fout ⇒ zelfde foto, concrete melding.
- "Foto goedkeuren" vs "Dossier afronden…" met eindcontrole-sheet; geen globale Enter.
- "Herstel goedkeuring/afkeuring/afhandeling" na geslaagde opslag; succes pas na serverbevestiging.
- `src/lib/beoordeling.ts`: pure regels (filter, selectie, volgende, sneltoetsen, eindcontrole).
- Vindbaarheid: knop "Beoordeling" (Fotobeoordeling) op de startpagina, "Dossier beoordelen" op opgeleverde TerreVolt-stations; lijst heet "Fotobeoordeling" en toont laad-/foutstatus. Bij andere opgeslagen opdrachtgever: knop "Beoordelen als …".

## Uitgevoerde verificatie
- `bunx vitest run`: 25 bestanden geslaagd, 5 DB-bestanden overgeslagen (geen PG zonder runner).
- `bash scripts/test-local-pg.sh` (tijdelijke lokale PostgreSQL met alle migraties): **30 bestanden, 230 tests geslaagd**, waaronder `fotobeoordeling.db.test.ts` (6): anon/verlopen sessie geweigerd, stale versie/dubbele beslissing, eigen undo vs. andere sessie/collega, eindcontrole open afkeur vs. expliciete afhandeling (geen afleiding uit andere goedgekeurde foto), geldig all-N.v.t., monteur kan versie/afhandeling niet vervalsen, snapshot sluit afkeur uit.
- `fotobeoordeling.test.tsx` (17): filterwissel naar nul, afkeur + A, dubbele A/klik tijdens PIN-await, leesfouten (foto's/N.v.t./eindcontrole) blokkeren, server-weigering is geen succes, undo eigen/concurrent, all-N.v.t., 30 gemengde foto's (tellingen/selectie/focus), Enter rondt niet af.
- Verouderde Enter-/"Keur goed"-regressies in `correcties-fase1.test.tsx` vervangen door bovenstaande RPC-gebaseerde tests.
- `tsc --noEmit -p tsconfig.app.json` en `vite build`: geslaagd.
- Headless Chromium (alleen lezen, geen beslissingen): 360×740, 390×844 en 1280×800 — acties volledig in beeld, zoom opent/sluit; stationspagina toont "Dossier beoordelen".

## Niet uitgevoerd / beperkingen
- Geen echte beslissingen, uploads of SharePoint/Graph-writes in productie of preview; serverbeslissingen alleen in de lokale testdatabase bewezen.
- Overgang: de nog gepubliceerde frontend schrijft direct naar `fotos`/`stations` (blijft werken, `review_versie` loopt mee) maar gebruikt de eindcontrole niet. Na herindienen blijven afkeuren nu "afgekeurd" en tellen daar niet meer als "te beoordelen"; de oude frontend kan zo'n afkeur niet expliciet afhandelen. Publiceer de nieuwe frontend samen.
- Historie van beslissingen van vóór deze migratie bestaat niet.
