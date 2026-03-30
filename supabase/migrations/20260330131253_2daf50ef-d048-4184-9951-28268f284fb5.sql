-- Create stations table
CREATE TABLE public.stations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  naam_msr text NOT NULL,
  behuizingsnummer text,
  type_ruimte text CHECK (type_ruimte IN ('Compact Station', 'Betreedbaar station')),
  ingevuld_door text,
  datum date,
  vermogensveld boolean DEFAULT false,
  da_kast boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create fotos table
CREATE TABLE public.fotos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id uuid REFERENCES public.stations(id) ON DELETE CASCADE NOT NULL,
  categorie text NOT NULL,
  volgorde integer,
  storage_path text NOT NULL,
  url text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fotos ENABLE ROW LEVEL SECURITY;

-- Public access policies (no auth required for this app)
CREATE POLICY "Anyone can view stations" ON public.stations FOR SELECT USING (true);
CREATE POLICY "Anyone can create stations" ON public.stations FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update stations" ON public.stations FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete stations" ON public.stations FOR DELETE USING (true);

CREATE POLICY "Anyone can view fotos" ON public.fotos FOR SELECT USING (true);
CREATE POLICY "Anyone can create fotos" ON public.fotos FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can delete fotos" ON public.fotos FOR DELETE USING (true);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_stations_updated_at
  BEFORE UPDATE ON public.stations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('to-fotos', 'to-fotos', true);

-- Storage policies
CREATE POLICY "Public read to-fotos" ON storage.objects FOR SELECT USING (bucket_id = 'to-fotos');
CREATE POLICY "Anyone can upload to-fotos" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'to-fotos');
CREATE POLICY "Anyone can delete to-fotos" ON storage.objects FOR DELETE USING (bucket_id = 'to-fotos');

-- Indexes
CREATE INDEX idx_fotos_station_id ON public.fotos(station_id);
CREATE INDEX idx_fotos_categorie ON public.fotos(categorie);
CREATE INDEX idx_stations_naam_msr ON public.stations(naam_msr);