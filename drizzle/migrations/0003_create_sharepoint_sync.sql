CREATE TABLE public.sharepoint_sync (
  station_id uuid PRIMARY KEY REFERENCES public.stations(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'bezig',
  aantal_bestanden integer NOT NULL DEFAULT 0,
  fout text,
  sharepoint_url text,
  gesynct_op timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sharepoint_sync TO anon, authenticated;
GRANT ALL ON public.sharepoint_sync TO service_role;
ALTER TABLE public.sharepoint_sync ENABLE ROW LEVEL SECURITY;
CREATE POLICY sharepoint_sync_public_read ON public.sharepoint_sync FOR SELECT TO anon, authenticated USING (true);
CREATE OR REPLACE FUNCTION public.sharepoint_sync_status_check() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status NOT IN ('bezig','gelukt','mislukt') THEN RAISE EXCEPTION 'ongeldige status %', NEW.status; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sharepoint_sync_status_check BEFORE INSERT OR UPDATE ON public.sharepoint_sync FOR EACH ROW EXECUTE FUNCTION public.sharepoint_sync_status_check();