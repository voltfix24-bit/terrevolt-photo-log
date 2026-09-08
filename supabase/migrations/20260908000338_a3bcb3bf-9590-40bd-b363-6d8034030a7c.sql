
ALTER TABLE public.stations
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS submitted_by text,
  ADD COLUMN IF NOT EXISTS opdrachtgever text,
  ADD COLUMN IF NOT EXISTS review_reden text;

ALTER TABLE public.fotos
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS review_reden text,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS gps_afstand_m integer,
  ADD COLUMN IF NOT EXISTS scherpte text;

DROP POLICY IF EXISTS "Anyone can update fotos" ON public.fotos;
CREATE POLICY "Anyone can update fotos" ON public.fotos FOR UPDATE USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.opdrachtgevers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  naam text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.opdrachtgevers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.opdrachtgevers TO anon;
GRANT ALL ON public.opdrachtgevers TO service_role;

ALTER TABLE public.opdrachtgevers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Opdrachtgevers zijn publiek leesbaar" ON public.opdrachtgevers;
CREATE POLICY "Opdrachtgevers zijn publiek leesbaar" ON public.opdrachtgevers FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Opdrachtgevers zijn publiek toe te voegen" ON public.opdrachtgevers;
CREATE POLICY "Opdrachtgevers zijn publiek toe te voegen" ON public.opdrachtgevers FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Opdrachtgevers zijn publiek aanpasbaar" ON public.opdrachtgevers;
CREATE POLICY "Opdrachtgevers zijn publiek aanpasbaar" ON public.opdrachtgevers FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Opdrachtgevers zijn publiek te verwijderen" ON public.opdrachtgevers;
CREATE POLICY "Opdrachtgevers zijn publiek te verwijderen" ON public.opdrachtgevers FOR DELETE TO anon, authenticated USING (true);

INSERT INTO public.opdrachtgevers (naam)
SELECT v FROM (VALUES ('Liander'), ('Enexis'), ('Stedin')) AS t(v)
WHERE NOT EXISTS (SELECT 1 FROM public.opdrachtgevers);
