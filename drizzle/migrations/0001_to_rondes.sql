ALTER TABLE public.stations
  ADD COLUMN IF NOT EXISTS dossier_status text NOT NULL DEFAULT 'ingediend' CHECK (dossier_status IN ('ingediend','volledig','afgerond')),
  ADD COLUMN IF NOT EXISTS dossier_notitie text;

CREATE TABLE IF NOT EXISTS public.to_rondes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id uuid NOT NULL REFERENCES public.stations(id) ON DELETE CASCADE,
  nummer int NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','controle','afgekeurd','goedgekeurd')),
  ingediend_op date,
  ingediend_bij text CHECK (ingediend_bij IN ('Van Gelder','Liander')),
  reactie_op date,
  redenen text[] NOT NULL DEFAULT '{}',
  notitie text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (station_id, nummer)
);

CREATE TABLE IF NOT EXISTS public.to_acties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ronde_id uuid NOT NULL REFERENCES public.to_rondes(id) ON DELETE CASCADE,
  station_id uuid NOT NULL REFERENCES public.stations(id) ON DELETE CASCADE,
  omschrijving text NOT NULL,
  bij text NOT NULL CHECK (bij IN ('TerreVolt','Van Gelder','Liander','Derden')),
  derde_naam text,
  notitie text,
  afgehandeld_op date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS to_rondes_station_idx ON public.to_rondes(station_id);
CREATE INDEX IF NOT EXISTS to_acties_ronde_idx ON public.to_acties(ronde_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.to_rondes TO anon, authenticated;
GRANT ALL ON public.to_rondes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.to_acties TO anon, authenticated;
GRANT ALL ON public.to_acties TO service_role;

ALTER TABLE public.to_rondes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.to_acties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tor_all" ON public.to_rondes FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "toa_all" ON public.to_acties FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);