CREATE TYPE public.case_uitvoerder AS ENUM ('terrevolt', 'van_gelder');
ALTER TABLE public.stations ADD COLUMN uitvoerder public.case_uitvoerder NOT NULL DEFAULT 'terrevolt';
ALTER TABLE public.stations ADD COLUMN wv text;
CREATE INDEX stations_uitvoerder_idx ON public.stations (uitvoerder);
CREATE INDEX stations_casenummer_norm_idx ON public.stations (lower(btrim(casenummer)));
CREATE UNIQUE INDEX stations_vg_casenummer_uniek ON public.stations (lower(btrim(casenummer))) WHERE uitvoerder = 'van_gelder';

CREATE OR REPLACE FUNCTION public.maak_case(_casenummer text, _casenaam text, _uitvoerder public.case_uitvoerder DEFAULT 'van_gelder', _wv text DEFAULT NULL, _notitie text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  nr text := regexp_replace(btrim(coalesce(_casenummer, '')), '\s+', ' ', 'g');
  naam text := regexp_replace(btrim(coalesce(_casenaam, '')), '\s+', ' ', 'g');
  wv text := nullif(regexp_replace(btrim(coalesce(_wv, '')), '\s+', ' ', 'g'), '');
  notitie text := nullif(btrim(coalesce(_notitie, '')), '');
  sid uuid;
BEGIN
  IF nr = '' THEN RAISE EXCEPTION 'Casenummer is verplicht' USING ERRCODE = '22023'; END IF;
  IF naam = '' THEN RAISE EXCEPTION 'Casenaam is verplicht' USING ERRCODE = '22023'; END IF;
  IF length(nr) > 100 OR length(naam) > 300 OR length(coalesce(wv, '')) > 300 OR length(coalesce(notitie, '')) > 4000 THEN
    RAISE EXCEPTION 'Invoer te lang' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('case:' || lower(nr)));
  IF EXISTS (SELECT 1 FROM public.stations WHERE lower(btrim(casenummer)) = lower(nr)) THEN
    RAISE EXCEPTION 'Casenummer % bestaat al', nr USING ERRCODE = '23505';
  END IF;
  INSERT INTO public.stations (naam_msr, casenummer, casenaam, uitvoerder, wv, dossier_notitie, status, type_ruimte)
  VALUES (naam, nr, naam, _uitvoerder, wv, notitie, 'concept', NULL)
  RETURNING id INTO sid;
  INSERT INTO public.to_rondes (station_id, nummer, status, ingediend_op) VALUES (sid, 1, 'open', NULL);
  RETURN sid;
END $$;
REVOKE ALL ON FUNCTION public.maak_case(text, text, public.case_uitvoerder, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.maak_case(text, text, public.case_uitvoerder, text, text) TO anon, authenticated, service_role;