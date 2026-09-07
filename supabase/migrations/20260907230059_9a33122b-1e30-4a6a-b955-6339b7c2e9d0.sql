CREATE TABLE public.categorie_skips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id UUID NOT NULL REFERENCES public.stations(id) ON DELETE CASCADE,
  categorie TEXT NOT NULL,
  reden TEXT NOT NULL CHECK (length(trim(reden)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (station_id, categorie)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.categorie_skips TO anon, authenticated;
GRANT ALL ON public.categorie_skips TO service_role;

ALTER TABLE public.categorie_skips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Categorie skips zijn publiek leesbaar"
ON public.categorie_skips FOR SELECT TO anon, authenticated
USING (true);

CREATE POLICY "Categorie skips zijn publiek toe te voegen"
ON public.categorie_skips FOR INSERT TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Categorie skips zijn publiek aanpasbaar"
ON public.categorie_skips FOR UPDATE TO anon, authenticated
USING (true) WITH CHECK (true);

CREATE POLICY "Categorie skips zijn publiek te verwijderen"
ON public.categorie_skips FOR DELETE TO anon, authenticated
USING (true);

CREATE TRIGGER update_categorie_skips_updated_at
BEFORE UPDATE ON public.categorie_skips
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();