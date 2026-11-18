ALTER TABLE public.sharepoint_sync DROP CONSTRAINT IF EXISTS sharepoint_sync_station_id_fkey;
ALTER TABLE public.sharepoint_sync ADD COLUMN IF NOT EXISTS sharepoint_item_id text;

CREATE TABLE public.sharepoint_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gestart_op timestamptz NOT NULL DEFAULT now(),
  klaar_op timestamptz,
  handmatig boolean NOT NULL DEFAULT false,
  stations integer NOT NULL DEFAULT 0,
  toegevoegd integer NOT NULL DEFAULT 0,
  verwijderd integer NOT NULL DEFAULT 0,
  verplaatst integer NOT NULL DEFAULT 0,
  fouten jsonb NOT NULL DEFAULT '[]'::jsonb
);
GRANT SELECT ON public.sharepoint_sync_runs TO anon, authenticated;
GRANT ALL ON public.sharepoint_sync_runs TO service_role;
ALTER TABLE public.sharepoint_sync_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY sharepoint_sync_runs_read ON public.sharepoint_sync_runs FOR SELECT TO anon, authenticated USING (true);