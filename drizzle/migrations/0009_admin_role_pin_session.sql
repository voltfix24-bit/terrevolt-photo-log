CREATE TYPE public.app_role AS ENUM ('admin');
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_roles_own_read ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

-- Mislukte pincode-pogingen (alleen voor de server; brute-force-rem)
CREATE TABLE public.pin_pogingen (
  id bigserial PRIMARY KEY,
  sleutel text NOT NULL,
  gelukt boolean NOT NULL DEFAULT false,
  tijd timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pin_pogingen_sleutel_tijd ON public.pin_pogingen (sleutel, tijd);
GRANT ALL ON public.pin_pogingen TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.pin_pogingen_id_seq TO service_role;
ALTER TABLE public.pin_pogingen ENABLE ROW LEVEL SECURITY;

-- Stations: verwijderen alleen nog met beheerderssessie (achter de pincode)
DROP POLICY IF EXISTS stations_anon_write ON public.stations;
CREATE POLICY stations_anon_insert ON public.stations FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY stations_anon_update ON public.stations FOR UPDATE TO anon USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS stations_auth_delete ON public.stations;
CREATE POLICY stations_admin_delete ON public.stations FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Foto's: verwijderen alleen met beheerderssessie
DROP POLICY IF EXISTS fotos_anon_write ON public.fotos;
CREATE POLICY fotos_anon_insert ON public.fotos FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY fotos_anon_update ON public.fotos FOR UPDATE TO anon USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS fotos_auth_delete ON public.fotos;
CREATE POLICY fotos_admin_delete ON public.fotos FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Fotobestanden: verwijderen alleen met beheerderssessie
DROP POLICY IF EXISTS "Anyone can delete to-fotos" ON storage.objects;
DROP POLICY IF EXISTS tofotos_auth_delete ON storage.objects;
CREATE POLICY tofotos_admin_delete ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'to-fotos' AND public.has_role(auth.uid(), 'admin'));