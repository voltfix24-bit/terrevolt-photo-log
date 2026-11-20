DROP FUNCTION IF EXISTS public.maak_case(text, text, public.case_uitvoerder, text, text, integer, text, date);

CREATE FUNCTION public.maak_case(
  _casenummer text, _casenaam text, _uitvoerder public.case_uitvoerder DEFAULT 'van_gelder', _wv text DEFAULT NULL, _notitie text DEFAULT NULL,
  _ronde integer DEFAULT 1, _to_status text DEFAULT 'open', _ingediend_op date DEFAULT NULL,
  _on_hold boolean DEFAULT false, _on_hold_reden text DEFAULT NULL)
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
  hreden text := nullif(btrim(coalesce(_on_hold_reden, '')), '');
  st text := lower(btrim(coalesce(_to_status, 'open')));
  rn integer := coalesce(_ronde, 1);
  sid uuid;
  i integer;
BEGIN
  IF nr = '' THEN RAISE EXCEPTION 'Casenummer is verplicht' USING ERRCODE = '22023'; END IF;
  IF naam = '' THEN RAISE EXCEPTION 'Casenaam is verplicht' USING ERRCODE = '22023'; END IF;
  IF length(nr) > 100 OR length(naam) > 300 OR length(coalesce(wv, '')) > 300 OR length(coalesce(notitie, '')) > 4000 OR length(coalesce(hreden, '')) > 1000 THEN
    RAISE EXCEPTION 'Invoer te lang' USING ERRCODE = '22023';
  END IF;
  IF st NOT IN ('open', 'controle', 'afgekeurd', 'goedgekeurd') THEN RAISE EXCEPTION 'Ongeldige TO-status %', _to_status USING ERRCODE = '22023'; END IF;
  IF rn < 1 OR rn > 50 THEN RAISE EXCEPTION 'Ongeldige ronde %', rn USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('case:' || lower(nr)));
  IF EXISTS (SELECT 1 FROM public.stations WHERE lower(btrim(casenummer)) = lower(nr)) THEN
    RAISE EXCEPTION 'Casenummer % bestaat al', nr USING ERRCODE = '23505';
  END IF;
  INSERT INTO public.stations (naam_msr, casenummer, casenaam, uitvoerder, wv, dossier_notitie, status, type_ruimte, on_hold, on_hold_reden, on_hold_sinds, on_hold_partij)
  VALUES (naam, nr, naam, _uitvoerder, wv, notitie, 'concept', NULL, coalesce(_on_hold, false),
    CASE WHEN _on_hold THEN coalesce(hreden, 'Geïmporteerd als on hold') END,
    CASE WHEN _on_hold THEN current_date END,
    CASE WHEN _on_hold THEN 'terrevolt'::public.on_hold_partij END)
  RETURNING id INTO sid;
  FOR i IN 1..(rn - 1) LOOP
    INSERT INTO public.to_rondes (station_id, nummer, status, ingediend_op, ingediend_bij) VALUES (sid, i, 'afgekeurd', NULL, 'Van Gelder');
  END LOOP;
  INSERT INTO public.to_rondes (station_id, nummer, status, ingediend_op, ingediend_bij)
  VALUES (sid, rn, st, CASE WHEN st = 'open' THEN NULL ELSE _ingediend_op END, CASE WHEN st = 'open' THEN NULL ELSE 'Van Gelder' END);
  RETURN sid;
END $$;
REVOKE ALL ON FUNCTION public.maak_case(text, text, public.case_uitvoerder, text, text, integer, text, date, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.maak_case(text, text, public.case_uitvoerder, text, text, integer, text, date, boolean, text) TO anon, authenticated, service_role;