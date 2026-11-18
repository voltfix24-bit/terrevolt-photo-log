
- SharePoint sync lives in edge function `sharepoint-sync` (Graph app-only); `supabase/functions/sharepoint-sync/categories.ts` is a copy of SECTIONS/CATEGORIES (id, section, name) and must be regenerated when categories change. Why: edge functions can't import src/.
- `oplever-rapport` triggers `sharepoint-sync` in the background (waitUntil, anon JWT) and never fails on sync errors. Why: delivery must not depend on SharePoint.
