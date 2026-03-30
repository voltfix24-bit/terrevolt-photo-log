
CREATE TABLE IF NOT EXISTS public.categorie_voorbeelden (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  categorie text NOT NULL,
  url text NOT NULL,
  storage_path text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.categorie_voorbeelden ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on categorie_voorbeelden"
  ON public.categorie_voorbeelden FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow public insert on categorie_voorbeelden"
  ON public.categorie_voorbeelden FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Allow public delete on categorie_voorbeelden"
  ON public.categorie_voorbeelden FOR DELETE
  TO anon, authenticated
  USING (true);
