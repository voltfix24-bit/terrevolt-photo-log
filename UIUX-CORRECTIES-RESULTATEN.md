# UI/UX — resterende reviewcorrecties

Startpunt `c608768`. Geen frontendpublicatie, geen migraties of function-deployments, geen productie-uploads, beoordelingen of SharePoint-verzoeken.

## Wijzigingen
1. **BeoordeelDossier, filter en fotokeuze**: `lijstGen`-effect vervangen door `gebruikerGen`. Die wordt synchroon verhoogd bij filterwissel (`setFilter`), handmatige keuze (thumbnails, raster, pijltjes via `kiesFoto`) en stationwissel. Automatische selectie na een bevestigde beslissing verhoogt hem niet. `metSlot` controleert na de PIN-await station én gebruikerscontext; afronden alleen het station. Undo wist een voltooid herstel binnen de stationguard en verandert filter/selectie/focus alleen als de gebruikerscontext ongewijzigd is. Caches worden altijd voor het oorspronkelijke station ververst.
2. **Eindcontrole**: `vereisteCheck` toont bij `te_beoordelen > 0` een neutrale regel ("De aanwezige foto's moeten nog worden beoordeeld", grijs pictogram, geen vinkje). De goedkeuringstekst verschijnt alleen bij nul te beoordelen en nul ontbrekend. Ontbrekende onderdelen blijven zichtbaar; servercontrole en de all-N.v.t.-regel zijn ongewijzigd.
3. **Onbevestigd**: `isOnbevestigd(error)` (fout zonder code) geldt voor beslissen, herstellen en afronden: `ONBEVESTIGD_TEKST` en verversen van het oorspronkelijke station. 42501 en serverredenen blijven concreet gemeld.
4. **Verstuurde previews**: de sync ruimt `done`-items niet meer direct op. `markDone` legt `klaarOp` vast. Na de sync verwijdert `ruimVerstuurdOp` alleen items ouder dan 24 uur. Daarvóór verwijdert `useWachtrijCategorie` een item via `verwijderVerstuurd(id, pad)` pas als een serverlijst hetzelfde pad bevat; dat gebeurt atomair en alleen bij status done met precies dat pad. Zo overleeft de tegel een categoriewissel en een remount. `done` telt niet mee in counters en wordt niet opnieuw verzonden.
5. **Aandachtlijst**: na de on-holdprioriteit worden afgeronde dossiers volledig overgeslagen.
6. **Import**: rij-opacity verwijderd.

## Verificatie (uitgevoerd)
- Nieuw: `src/test/uiux-correcties.test.tsx` (8 tests):
  - uitgestelde PIN + filterwissel en + andere fotokeuze: geen RPC;
  - uitgestelde undo + filterwissel en + andere fotokeuze: keuze van de gebruiker blijft en de herstelknop is gewist;
  - eindcontrole bij pending versus volledig beoordeeld;
  - `{data:null, error:{message}}` bij undo en afronden: onbevestigde melding, geen "Niet hersteld"/"niet afgerond", geen succes of SharePoint-sync.
- Uitgebreid: `uiux-fase3-wachtrij.test.tsx` (+2): bevestigde upload met trage server, categorie weg/terug en volledige remount → tegel blijft "Verstuurd" zonder herverzending. Na serverovername nul lokale tegels (exact één, de servertegel) en het IDB-record is verwijderd. Opruimen na de sync laat verse items staan en verwijdert alleen verlopen items.
- Uitgebreid: `uiux-fase3-cases.test.tsx` (+1): afgekeurd + afgerond → geen aandachtactie; on hold met verlopen datum blijft "hervatten".
- `bash scripts/test-local-pg.sh`: **36 bestanden, 286 tests geslaagd** (inclusief lokale PostgreSQL).
- `tsgo -b --noEmit`: geen fouten. `vite build`: geslaagd.
- Headless Chromium, fictieve data, schrijfverzoeken geblokkeerd: importrij "Bestaat al" na afloop van de animatie: ancestor-opacity 1, tekst #4E6656 op wit = 6,25:1, casenaam 17,36:1.

## Grenzen
- De Verder-knop wordt in de wachtrijtest niet apart gerenderd. De test bewijst dat de hook-items (waar de wizard tegel en CTA uit afleidt) blijven bestaan; dezelfde afleiding was eerder in WizardView getest.
- Een verstuurd item van een station dat niet opnieuw wordt geopend, blijft lokaal bewaard tot een volgende synchronisatie het opruimt: 24 uur is daarbij de drempel voor items die dan ouder zijn, geen harde maximale bewaartijd zolang de app gesloten blijft (alleen als navigatiehulp, nooit als serverbewijs).
- Geen echte multi-tab-, iOS- of Android-test; IndexedDB via fake-indexeddb.
