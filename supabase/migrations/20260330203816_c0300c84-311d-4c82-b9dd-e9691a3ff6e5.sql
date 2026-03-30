
CREATE TABLE public.categorie_instellingen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  categorie_id integer NOT NULL UNIQUE,
  naam text,
  instructie text,
  tip text,
  volgorde integer,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.categorie_instellingen ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view categorie_instellingen" ON public.categorie_instellingen FOR SELECT TO public USING (true);
CREATE POLICY "Anyone can insert categorie_instellingen" ON public.categorie_instellingen FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Anyone can update categorie_instellingen" ON public.categorie_instellingen FOR UPDATE TO public USING (true);
CREATE POLICY "Anyone can delete categorie_instellingen" ON public.categorie_instellingen FOR DELETE TO public USING (true);
