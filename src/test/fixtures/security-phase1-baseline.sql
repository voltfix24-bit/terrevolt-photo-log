DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF; IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF; IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF; END $$;
CREATE SCHEMA auth; CREATE SCHEMA storage;
GRANT USAGE ON SCHEMA public,auth,storage TO anon,authenticated,service_role;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT (auth.jwt()->>'sub')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT auth.jwt()->>'role' $$;
CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid NOT NULL);
CREATE TYPE public.app_role AS ENUM('admin');
CREATE TYPE public.case_uitvoerder AS ENUM('terrevolt','van_gelder');
CREATE TYPE public.on_hold_partij AS ENUM('terrevolt','van_gelder','liander','derden');
CREATE SEQUENCE public.pin_pogingen_id_seq;
CREATE TABLE public.sharepoint_sync(station_id uuid NOT NULL, status text NOT NULL DEFAULT 'bezig'::text, aantal_bestanden integer NOT NULL DEFAULT 0, fout text, sharepoint_url text, gesynct_op timestamp with time zone NOT NULL DEFAULT now(), sharepoint_item_id text);
ALTER TABLE public.sharepoint_sync ADD PRIMARY KEY(station_id);
ALTER TABLE public.sharepoint_sync ENABLE ROW LEVEL SECURITY; GRANT ALL ON public.sharepoint_sync TO service_role;
GRANT SELECT ON public.sharepoint_sync TO anon,authenticated; CREATE POLICY fixture_read ON public.sharepoint_sync FOR SELECT TO anon,authenticated USING(true);
CREATE TABLE public.categorie_skips(id uuid NOT NULL DEFAULT gen_random_uuid(), station_id uuid NOT NULL, categorie text NOT NULL, reden text NOT NULL, created_at timestamp with time zone NOT NULL DEFAULT now(), updated_at timestamp with time zone NOT NULL DEFAULT now());
ALTER TABLE public.categorie_skips ADD PRIMARY KEY(id);
ALTER TABLE public.categorie_skips ENABLE ROW LEVEL SECURITY; GRANT ALL ON public.categorie_skips TO service_role;
GRANT SELECT ON public.categorie_skips TO anon,authenticated; CREATE POLICY fixture_read ON public.categorie_skips FOR SELECT TO anon,authenticated USING(true);
CREATE TABLE public.sharepoint_sync_runs(id uuid NOT NULL DEFAULT gen_random_uuid(), gestart_op timestamp with time zone NOT NULL DEFAULT now(), klaar_op timestamp with time zone, handmatig boolean NOT NULL DEFAULT false, stations integer NOT NULL DEFAULT 0, toegevoegd integer NOT NULL DEFAULT 0, verwijderd integer NOT NULL DEFAULT 0, verplaatst integer NOT NULL DEFAULT 0, fouten jsonb NOT NULL DEFAULT '[]'::jsonb);
ALTER TABLE public.sharepoint_sync_runs ADD PRIMARY KEY(id);
ALTER TABLE public.sharepoint_sync_runs ENABLE ROW LEVEL SECURITY; GRANT ALL ON public.sharepoint_sync_runs TO service_role;
GRANT SELECT ON public.sharepoint_sync_runs TO anon,authenticated; CREATE POLICY fixture_read ON public.sharepoint_sync_runs FOR SELECT TO anon,authenticated USING(true);
CREATE TABLE public.opleverruns(id uuid NOT NULL DEFAULT gen_random_uuid(), station_id uuid NOT NULL, status text NOT NULL DEFAULT 'aangevraagd'::text, retry_stap text, poging integer NOT NULL DEFAULT 0, volgende_poging_op timestamp with time zone, lease_id uuid, lease_tot timestamp with time zone, pdf_run text, fout text, stap_fouten jsonb NOT NULL DEFAULT '{}'::jsonb, aangevraagd_door text, gestart_op timestamp with time zone NOT NULL DEFAULT now(), bijgewerkt_op timestamp with time zone NOT NULL DEFAULT now(), afgerond_op timestamp with time zone);
ALTER TABLE public.opleverruns ADD PRIMARY KEY(id);
ALTER TABLE public.opleverruns ENABLE ROW LEVEL SECURITY; GRANT ALL ON public.opleverruns TO service_role;
GRANT SELECT ON public.opleverruns TO anon,authenticated; CREATE POLICY fixture_read ON public.opleverruns FOR SELECT TO anon,authenticated USING(true);
CREATE TABLE public.categorie_voorbeelden(id uuid NOT NULL DEFAULT gen_random_uuid(), categorie text NOT NULL, url text NOT NULL, storage_path text NOT NULL, created_at timestamp with time zone DEFAULT now());
ALTER TABLE public.categorie_voorbeelden ADD PRIMARY KEY(id);
ALTER TABLE public.categorie_voorbeelden ENABLE ROW LEVEL SECURITY; GRANT ALL ON public.categorie_voorbeelden TO service_role;
GRANT SELECT ON public.categorie_voorbeelden TO anon,authenticated; CREATE POLICY fixture_read ON public.categorie_voorbeelden FOR SELECT TO anon,authenticated USING(true);
CREATE TABLE public.opdrachtgevers(id uuid NOT NULL DEFAULT gen_random_uuid(), naam text NOT NULL, created_at timestamp with time zone NOT NULL DEFAULT now());
ALTER TABLE public.opdrachtgevers ADD PRIMARY KEY(id);
ALTER TABLE public.opdrachtgevers ENABLE ROW LEVEL SECURITY; GRANT ALL ON public.opdrachtgevers TO service_role;
GRANT SELECT ON public.opdrachtgevers TO anon,authenticated; CREATE POLICY fixture_read ON public.opdrachtgevers FOR SELECT TO anon,authenticated USING(true);
CREATE TABLE public.categorie_opmerkingen(id uuid NOT NULL DEFAULT gen_random_uuid(), station_id uuid NOT NULL, categorie text NOT NULL, opmerking text NOT NULL, created_at timestamp with time zone DEFAULT now(), updated_at timestamp with time zone DEFAULT now());
ALTER TABLE public.categorie_opmerkingen ADD PRIMARY KEY(id);
ALTER TABLE public.categorie_opmerkingen ENABLE ROW LEVEL SECURITY; GRANT ALL ON public.categorie_opmerkingen TO service_role;
GRANT SELECT ON public.categorie_opmerkingen TO anon,authenticated; CREATE POLICY fixture_read ON public.categorie_opmerkingen FOR SELECT TO anon,authenticated USING(true);
CREATE TABLE public.categorie_instellingen(id uuid NOT NULL DEFAULT gen_random_uuid(), categorie_id integer NOT NULL, naam text, instructie text, tip text, volgorde integer, created_at timestamp with time zone DEFAULT now(), updated_at timestamp with time zone DEFAULT now());
ALTER TABLE public.categorie_instellingen ADD PRIMARY KEY(id);
ALTER TABLE public.categorie_instellingen ENABLE ROW LEVEL SECURITY; GRANT ALL ON public.categorie_instellingen TO service_role;
GRANT SELECT ON public.categorie_instellingen TO anon,authenticated; CREATE POLICY fixture_read ON public.categorie_instellingen FOR SELECT TO anon,authenticated USING(true);
CREATE TABLE public.monteurs(id uuid NOT NULL DEFAULT gen_random_uuid(), naam text NOT NULL, created_at timestamp with time zone DEFAULT now());
ALTER TABLE public.monteurs ADD PRIMARY KEY(id);
ALTER TABLE public.monteurs ENABLE ROW LEVEL SECURITY; GRANT ALL ON public.monteurs TO service_role;
GRANT SELECT ON public.monteurs TO anon,authenticated; CREATE POLICY fixture_read ON public.monteurs FOR SELECT TO anon,authenticated USING(true);
CREATE TABLE public.push_subscriptions(id uuid NOT NULL DEFAULT gen_random_uuid(), endpoint text NOT NULL, p256dh text NOT NULL, auth text NOT NULL, user_label text, created_at timestamp with time zone DEFAULT now());
ALTER TABLE public.push_subscriptions ADD PRIMARY KEY(id);
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY; GRANT ALL ON public.push_subscriptions TO service_role;
GRANT SELECT ON public.push_subscriptions TO anon,authenticated; CREATE POLICY fixture_read ON public.push_subscriptions FOR SELECT TO anon,authenticated USING(true);
CREATE TABLE public.instellingen(id uuid NOT NULL DEFAULT gen_random_uuid(), bedrijfsnaam text DEFAULT 'Terrevolt B.V.'::text, regio text DEFAULT 'Liander Zuidoost'::text, logo_url text, profielfoto_url text, primary_color text DEFAULT '150 100% 20%'::text, primary_light_color text DEFAULT '140 65% 66%'::text, background_color text DEFAULT '116 90% 96%'::text, accent_gold_color text DEFAULT '44 100% 23%'::text, orange_color text DEFAULT '15 82% 50%'::text, created_at timestamp with time zone DEFAULT now(), updated_at timestamp with time zone DEFAULT now(), sp_sleutel_verloopt_op date, sp_sleutel_automatisch boolean NOT NULL DEFAULT false, sp_auth_fout text, sp_machtigingen_nodig text[] NOT NULL DEFAULT '{}'::text[], sp_gecontroleerd_op timestamp with time zone);
ALTER TABLE public.instellingen ADD PRIMARY KEY(id);
ALTER TABLE public.instellingen ENABLE ROW LEVEL SECURITY; GRANT ALL ON public.instellingen TO service_role;
GRANT SELECT ON public.instellingen TO anon,authenticated; CREATE POLICY fixture_read ON public.instellingen FOR SELECT TO anon,authenticated USING(true);
CREATE TABLE public.stations(id uuid NOT NULL DEFAULT gen_random_uuid(), naam_msr text NOT NULL, behuizingsnummer text, type_ruimte text, ingevuld_door text, datum date, vermogensveld boolean DEFAULT false, da_kast boolean DEFAULT false, created_at timestamp with time zone DEFAULT now(), updated_at timestamp with time zone DEFAULT now(), status text DEFAULT 'concept'::text, submitted_at timestamp with time zone, submitted_by text, opdrachtgever text DEFAULT 'van Gelder'::text, review_reden text, casenummer text, casenaam text, dossier_status text NOT NULL DEFAULT 'ingediend'::text, dossier_notitie text, case_verborgen boolean NOT NULL DEFAULT false, uitvoerder case_uitvoerder NOT NULL DEFAULT 'terrevolt'::case_uitvoerder, wv text, is_nummer text, tg boolean NOT NULL DEFAULT false, on_hold boolean NOT NULL DEFAULT false, on_hold_reden text, on_hold_sinds date, on_hold_tot date, on_hold_partij on_hold_partij);
ALTER TABLE public.stations ADD PRIMARY KEY(id);
ALTER TABLE public.stations ENABLE ROW LEVEL SECURITY; GRANT ALL ON public.stations TO service_role;
GRANT SELECT ON public.stations TO anon,authenticated; CREATE POLICY fixture_read ON public.stations FOR SELECT TO anon,authenticated USING(true);
CREATE TABLE public.rapport_pdf(station_id uuid NOT NULL, status text NOT NULL DEFAULT 'bezig'::text, fout text, bytes bigint, paginas integer, fotos integer, gestart_op timestamp with time zone NOT NULL DEFAULT now(), klaar_op timestamp with time zone);
ALTER TABLE public.rapport_pdf ADD PRIMARY KEY(station_id);
ALTER TABLE public.rapport_pdf ENABLE ROW LEVEL SECURITY; GRANT ALL ON public.rapport_pdf TO service_role;
GRANT SELECT ON public.rapport_pdf TO anon,authenticated; CREATE POLICY fixture_read ON public.rapport_pdf FOR SELECT TO anon,authenticated USING(true);
CREATE TABLE public.fotos(id uuid NOT NULL DEFAULT gen_random_uuid(), station_id uuid NOT NULL, categorie text NOT NULL, volgorde integer, storage_path text NOT NULL, url text NOT NULL, created_at timestamp with time zone DEFAULT now(), uploaded_at timestamp with time zone DEFAULT now(), review_status text NOT NULL DEFAULT 'pending'::text, review_reden text, reviewed_at timestamp with time zone, gps_afstand_m integer, scherpte text);
ALTER TABLE public.fotos ADD PRIMARY KEY(id);
ALTER TABLE public.fotos ENABLE ROW LEVEL SECURITY; GRANT ALL ON public.fotos TO service_role;
GRANT SELECT ON public.fotos TO anon,authenticated; CREATE POLICY fixture_read ON public.fotos FOR SELECT TO anon,authenticated USING(true);
CREATE TABLE public.to_rondes(id uuid NOT NULL DEFAULT gen_random_uuid(), station_id uuid NOT NULL, nummer integer NOT NULL, status text NOT NULL DEFAULT 'open'::text, ingediend_op date, ingediend_bij text, reactie_op date, redenen text[] NOT NULL DEFAULT '{}'::text[], notitie text, created_at timestamp with time zone NOT NULL DEFAULT now());
ALTER TABLE public.to_rondes ADD PRIMARY KEY(id);
ALTER TABLE public.to_rondes ENABLE ROW LEVEL SECURITY; GRANT ALL ON public.to_rondes TO service_role;
GRANT SELECT ON public.to_rondes TO anon,authenticated; CREATE POLICY fixture_read ON public.to_rondes FOR SELECT TO anon,authenticated USING(true);
CREATE TABLE public.to_acties(id uuid NOT NULL DEFAULT gen_random_uuid(), ronde_id uuid NOT NULL, station_id uuid NOT NULL, omschrijving text NOT NULL, bij text NOT NULL, derde_naam text, notitie text, afgehandeld_op date, created_at timestamp with time zone NOT NULL DEFAULT now());
ALTER TABLE public.to_acties ADD PRIMARY KEY(id);
ALTER TABLE public.to_acties ENABLE ROW LEVEL SECURITY; GRANT ALL ON public.to_acties TO service_role;
GRANT SELECT ON public.to_acties TO anon,authenticated; CREATE POLICY fixture_read ON public.to_acties FOR SELECT TO anon,authenticated USING(true);
CREATE TABLE public.user_roles(id uuid NOT NULL DEFAULT gen_random_uuid(), user_id uuid NOT NULL, role app_role NOT NULL);
ALTER TABLE public.user_roles ADD PRIMARY KEY(id);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY; GRANT ALL ON public.user_roles TO service_role;
GRANT SELECT ON public.user_roles TO anon,authenticated; CREATE POLICY fixture_read ON public.user_roles FOR SELECT TO anon,authenticated USING(true);
CREATE TABLE public.pin_pogingen(id bigint NOT NULL DEFAULT nextval('pin_pogingen_id_seq'::regclass), sleutel text NOT NULL, gelukt boolean NOT NULL DEFAULT false, tijd timestamp with time zone NOT NULL DEFAULT now());
ALTER TABLE public.pin_pogingen ADD PRIMARY KEY(id);
ALTER TABLE public.pin_pogingen ENABLE ROW LEVEL SECURITY; GRANT ALL ON public.pin_pogingen TO service_role;
CREATE UNIQUE INDEX ON public.categorie_opmerkingen(station_id,categorie);
CREATE UNIQUE INDEX ON public.categorie_skips(station_id,categorie);
CREATE UNIQUE INDEX ON public.user_roles(user_id,role);
CREATE UNIQUE INDEX ON public.fotos(storage_path);
CREATE UNIQUE INDEX ON public.opleverruns(station_id) WHERE status NOT IN ('afgerond','mislukt');
CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text,name text);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT ALL ON storage.objects TO anon,authenticated,service_role;
CREATE POLICY fixture_read ON storage.objects FOR SELECT TO anon,authenticated USING(bucket_id IN ('to-fotos','branding'));
CREATE FUNCTION public.has_role(_user_id uuid,_role public.app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_role) $$;
CREATE FUNCTION public.opleverrun_claim(_id uuid,_seconden integer) RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ UPDATE public.opleverruns SET lease_id=gen_random_uuid(),lease_tot=now()+make_interval(secs=>_seconden) WHERE id=_id AND status NOT IN ('afgerond','mislukt') AND (lease_tot IS NULL OR lease_tot<now()) RETURNING lease_id $$;
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