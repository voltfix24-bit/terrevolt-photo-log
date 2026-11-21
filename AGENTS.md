- Delivery: one active opleverrun with snapshot; all workers use station_claim owner/generation/server deadline and fenced acknowledgements; 10-min cron. Why: concurrency safety.
- `stations.uitvoerder` van_gelder = Cases & TO only: hidden from station lists/routes/PDF/SharePoint; created via RPC `maak_case`. Why: hard separation.
- SharePoint only syncs stations with status opgeleverd/goedgekeurd and trimmed casenummer+casenaam (`nietSyncReden`, mirrored in SharePointStatus.tsx); target is the case folder, a station subfolder only when a case has several stations; old {case}/{station} folders are flattened automatically on next sync. Why: one station per case, no half-finished data in SharePoint.
- SharePoint "10 Documenten" is never written by sync; app reads it via `sharepoint-documenten`. Metadata columns skip silently on 403; missing permissions/key expiry stored on `instellingen` (sp_*). Why: sync works without extra permissions.
- PDF/cache use immutable revisies/{run}; exact photo IDs required; conditional pointer preserves last good PDF; resolver supports legacy links; sync records hash. Why: no mixed/stale success.
- SharePoint "00 Rapport" holds only `Opleverrapport {casenummer} - {casenaam}.pdf`; rapport.html is an app-only fallback. Why: one report.
- App urls mirror SharePoint folders (`/{opdrachtgever}/{jaar}/{casenummer-casenaam}/…`); all links come from `src/lib/urls.ts`, routes resolve via `src/pages/UrlRoutes.tsx` by casenummer and `replace`-redirect to the canonical url. Why: shared/old links keep working when names change.
- `/:og` routes come after all fixed routes and only accept opdrachtgevers from the table (or used on stations); `/cases/:key` and `/beoordelen/:key` keep their own screens with readable slugs. Why: no collisions with fixed pages.
- Notes (categorie_opmerkingen) are edited only in `NotitieSheet` (visualViewport-positioned bottom sheet, autosave) and saved via `src/lib/notities.ts` with a localStorage offline queue flushed when back online. Why: iOS keyboard covered inline fields.
- A photo upload for a skipped category removes the skip; SharePoint gets `{nr}_{cat}_NIET GEMAAKT.txt` per skipped category without photos (sync-managed, deleted when no longer wanted) and an `Opmerking` column on files. Why: no contradictory status.
- `src/components/TerreVoltLoader.tsx` is the user's file, kept verbatim; the only loading indicator is via `src/components/Laden.tsx` (PaginaLader 80, BlokLader 48, KnopLader 20, LaadAfbeelding 40) — no skeletons/spinners. Why: one brand loader everywhere.
- No app-shell SW: manifest-only; `public/sw.js` is a kill-switch for old caches. Why: iPhone blank screens.
- Storage branding writes require a live PIN grant; uploads use new filenames. Why: protect settings without overwrites.
- Photo writes go through `src/lib/fotos-service.ts` (upload + DB insert, idempotent by storage_path; row deleted before file); station delete/SharePoint status via `src/lib/station-service.ts`. Why: no false success, retry-safe.
- Offline queue: remove only after storage+DB ok; failures stay 'error', retry with stable path `q_{queueId}`. Why: no loss/dupes.
- Required photos per category: only `src/lib/foto-regels.ts` (default 1; overrides need user OK). Why: one rule.
- `generatePdfHtml` escapes text, validates urls/HSL. Why: no injection.
- PIN is verified server-side by `pin-sessie` (PBKDF2 hash in secret ADMIN_PIN_HASH, rate-limited via `pin_pogingen`); success returns a real session for the admin account (`user_roles` role admin, password in ADMIN_SESSION_PASSWORD). No PIN in frontend code. Why: RLS can trust admin actions.
- All office, settings and destructive authorization uses `heeft_beheer()` (session_id + user_id + server deadline + revocation), never the permanent admin role alone. Why: independent fixed eight-hour grants.
- Internal PDF/SharePoint/cron calls verify the managed cron credential; manual starts/retry/sync require the same PIN grant as RLS. Why: service-role endpoints cannot trust public bearer strings.
- Index loads only `fotos(categorie, review_status)`. Why: payload.
- Station section cards use `Kaart` (Primitives): done = `doneBg`/`doneBorder`, open = white/`cardBorder`; never opacity or muted status colors. Why: finished sections must still look clickable.

## BESLUITEN
- Open mechanic access is limited to safe TerreVolt inserts, ordinary in-execution fields, undelivered photos/category notes and validated complete submission; all Cases & TO writes, settings/category management, deletion and delivered-dossier changes require PIN. Why: user-approved phase 1 access model.
- Keep `to-fotos` public and existing direct URLs; do not broaden permissions or backfill signed URLs. Why: preserve shared links.
- Queue only photos and notes offline; reject all other mutations without internet, and surface local persistence failures. Why: prevent false success and data loss.
- All progress/completion uses the central photo rule, including category 31. Why: one consistent requirement.
- Import: case_aanmaken wraps maak_case with own request/payload replay; full-number preview, paged rows, pause/resume remaining work. Why: no false import success.
- Holds use `hold_periodes`, atomic RPCs and expected period IDs; compatibility fields update together. Notes use their own CAS version, never resume-appends. Why: preserve history and concurrent text.
<!-- LOVABLE:BEGIN -->
- Weekly inventories use complete keyset reads and fail closed; cleanup rechecks existence and deletes only its mapping through the locked owner/generation/deadline RPC. Why: errors and stale workers must not archive living stations.
- SharePoint preflights accepted snapshots (no live fallback) or complete legacy sources before Graph mutations; changed revision/hash rewrites all managed content. Why: size equality does not establish content equality.
- Persist PDF cursor, attempt and progress clocks separately; scheduler filters healthy steps before limits, wakeups are optional, workers reread under claims and late errors use run CAS. Why: interrupted steps resume without terminal rollback.
- Local dossier drafts carry unique tokens; acknowledgements affect only their own token and failed saves stop. Why: navigation cannot erase newer drafts.
- Uncertain operation UUIDs survive retries; completed creates and closed import batches reset them. Why: new operations cannot reuse tombstones.
- Catch import-download rejection before React.lazy sees it; cold resolver errors terminate while cached offline routes remain available. Why: network errors must not blank the office or break opened photo work.
<!-- LOVABLE:END -->

- PIN grants bind real session_id and user_id for eight fixed server hours; unlock never resets the shared password, refresh never extends, lock revokes only this grant. Why: device independence.
- Field triggers check OLD/NEW; immutable photo sources/linkage and no storage overwrite prevent delivered-dossier bypasses.
- `fotodossier_aanbieden` is the sole open submission transition, locks the station and checks required categories/skips before creating the run. Why: RLS-safe atomic boundary.
- Keep phase-1 integration fixtures entirely local; do not mutate production or contact real SharePoint in tests. Why: user-approved isolation; scale tests belong to a later phase.
- Photo review/undo/finalize only via `foto_beoordelen`/`foto_beoordeling_herstellen`/`dossier_afronden` (PIN, `review_versie` CAS, history). Why: no lost colleague changes.
- Rejections persist across resubmission until explicitly resolved (`afkeur_afgehandeld_*`); never inferred; snapshots exclude rejected. Why: traceable resolution.
