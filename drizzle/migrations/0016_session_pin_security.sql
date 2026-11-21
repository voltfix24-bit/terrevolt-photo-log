CREATE TABLE public.beheer_sessies (
 session_id uuid PRIMARY KEY, user_id uuid NOT NULL, ontgrendeld_op timestamptz NOT NULL DEFAULT statement_timestamp(),
 geldig_tot timestamptz NOT NULL DEFAULT (statement_timestamp() + interval '8 hours'), ingetrokken_op timestamptz
);
GRANT ALL ON public.beheer_sessies TO service_role;
ALTER TABLE public.beheer_sessies ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.beheer_deadline_geldig(_tot timestamptz,_ingetrokken timestamptz,_nu timestamptz) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=public AS $$ SELECT _ingetrokken IS NULL AND _tot > _nu $$;
REVOKE ALL ON FUNCTION public.beheer_deadline_geldig(timestamptz,timestamptz,timestamptz) FROM PUBLIC;
CREATE FUNCTION public.heeft_beheer() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT EXISTS (SELECT 1 FROM public.beheer_sessies g WHERE g.session_id::text = auth.jwt()->>'session_id'
 AND g.user_id = auth.uid() AND public.beheer_deadline_geldig(g.geldig_tot,g.ingetrokken_op,statement_timestamp())
 AND public.has_role(auth.uid(), 'admin'));
$$;
REVOKE ALL ON FUNCTION public.heeft_beheer() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.heeft_beheer() TO anon, authenticated, service_role;
CREATE FUNCTION public.beheer_status() RETURNS timestamptz LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT geldig_tot FROM public.beheer_sessies WHERE session_id::text = auth.jwt()->>'session_id' AND user_id=auth.uid() AND public.heeft_beheer();
$$;
REVOKE ALL ON FUNCTION public.beheer_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.beheer_status() TO anon, authenticated;
CREATE FUNCTION public.beheer_vergrendelen() RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
 BEGIN
 UPDATE public.beheer_sessies SET ingetrokken_op=clock_timestamp() WHERE session_id::text=auth.jwt()->>'session_id' AND user_id=auth.uid() AND ingetrokken_op IS NULL;
 RETURN true;
 END $$;
REVOKE ALL ON FUNCTION public.beheer_vergrendelen() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.beheer_vergrendelen() TO authenticated;
CREATE FUNCTION public.beheer_toestaan(_session_id uuid, _user_id uuid) RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
 DECLARE deadline timestamptz;
 BEGIN
 IF NOT EXISTS(SELECT 1 FROM auth.sessions WHERE id=_session_id AND user_id=_user_id) OR NOT public.has_role(_user_id,'admin') THEN
 RAISE EXCEPTION 'Geen geldige beheersessie' USING ERRCODE='42501'; END IF;
 INSERT INTO public.beheer_sessies(session_id,user_id) VALUES(_session_id,_user_id) ON CONFLICT DO NOTHING;
 SELECT geldig_tot INTO deadline FROM public.beheer_sessies WHERE session_id=_session_id AND user_id=_user_id AND ingetrokken_op IS NULL AND geldig_tot>statement_timestamp();
 IF deadline IS NULL THEN RAISE EXCEPTION 'Nieuwe PIN-sessie nodig' USING ERRCODE='42501'; END IF;
 RETURN deadline;
 END $$;
REVOKE ALL ON FUNCTION public.beheer_toestaan(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.beheer_toestaan(uuid,uuid) TO service_role;
CREATE FUNCTION public.monteur_station(_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.stations WHERE id=_id AND uitvoerder='terrevolt' AND status IN ('concept','in uitvoering') AND submitted_at IS NULL);
$$;
CREATE FUNCTION public.fotowerk_toegestaan(_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.stations WHERE id=_id AND uitvoerder='terrevolt' AND (public.heeft_beheer() OR (status IN ('concept','in uitvoering','afgekeurd') AND submitted_at IS NULL)));
$$;
REVOKE ALL ON FUNCTION public.monteur_station(uuid),public.fotowerk_toegestaan(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.monteur_station(uuid),public.fotowerk_toegestaan(uuid) TO anon,authenticated,service_role;
DO $$ DECLARE p record; t text; BEGIN
 FOR p IN SELECT tablename,policyname FROM pg_policies WHERE schemaname='public' AND cmd<>'SELECT' AND tablename IN
 ('stations','fotos','categorie_opmerkingen','categorie_skips','to_rondes','to_acties','instellingen','categorie_instellingen','categorie_voorbeelden','monteurs','opdrachtgevers')
 LOOP EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,p.tablename); END LOOP;
 FOREACH t IN ARRAY ARRAY['to_rondes','to_acties','instellingen','categorie_instellingen','categorie_voorbeelden','monteurs','opdrachtgevers'] LOOP
 EXECUTE format('GRANT SELECT ON public.%I TO anon, authenticated',t);
 EXECUTE format('GRANT INSERT,UPDATE,DELETE ON public.%I TO authenticated',t);
 EXECUTE format('REVOKE INSERT,UPDATE,DELETE ON public.%I FROM anon',t);
 EXECUTE format('CREATE POLICY phase1_read ON public.%I FOR SELECT TO anon,authenticated USING (true)',t);
 EXECUTE format('CREATE POLICY phase1_office ON public.%I FOR ALL TO authenticated USING (public.heeft_beheer()) WITH CHECK (public.heeft_beheer())',t);
 END LOOP;
 END $$;
GRANT SELECT,INSERT,UPDATE ON public.stations TO anon,authenticated;
GRANT DELETE ON public.stations TO authenticated;
REVOKE DELETE ON public.stations FROM anon;
CREATE POLICY phase1_station_insert ON public.stations FOR INSERT TO anon,authenticated WITH CHECK (public.heeft_beheer() OR (uitvoerder='terrevolt' AND status='concept' AND submitted_at IS NULL));
CREATE POLICY phase1_station_update ON public.stations FOR UPDATE TO anon,authenticated USING (public.heeft_beheer() OR public.monteur_station(id)) WITH CHECK (public.heeft_beheer() OR public.monteur_station(id));
CREATE POLICY phase1_station_delete ON public.stations FOR DELETE TO authenticated USING(public.heeft_beheer());
CREATE FUNCTION public.bewaak_station() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
 DECLARE velden text[] := ARRAY['naam_msr','behuizingsnummer','type_ruimte','ingevuld_door','datum','vermogensveld','da_kast','casenummer','casenaam','opdrachtgever'];
 BEGIN
 IF TG_OP='UPDATE' AND NEW.uitvoerder='van_gelder' AND EXISTS(SELECT 1 FROM public.fotos WHERE station_id=OLD.id) THEN RAISE EXCEPTION 'Van Gelder-case mag geen fotos hebben' USING ERRCODE='22023'; END IF;
 IF auth.role()='service_role' OR current_user='postgres' OR public.heeft_beheer() THEN RETURN NEW; END IF;
 IF TG_OP='INSERT' THEN
 NEW.created_at:=statement_timestamp(); NEW.updated_at:=statement_timestamp();
 IF NEW.uitvoerder<>'terrevolt' OR NEW.status IS DISTINCT FROM 'concept' OR NEW.dossier_status<>'ingediend'
 OR NEW.wv IS NOT NULL OR NEW.is_nummer IS NOT NULL OR NEW.tg OR NEW.on_hold OR NEW.on_hold_reden IS NOT NULL
 OR NEW.on_hold_sinds IS NOT NULL OR NEW.on_hold_tot IS NOT NULL OR NEW.on_hold_partij IS NOT NULL
 OR NEW.case_verborgen OR NEW.dossier_notitie IS NOT NULL OR NEW.submitted_at IS NOT NULL OR NEW.submitted_by IS NOT NULL OR NEW.review_reden IS NOT NULL THEN
 RAISE EXCEPTION 'Beheer ontgrendelen nodig' USING ERRCODE='42501'; END IF;
 ELSE
 IF NOT public.monteur_station(OLD.id) OR (to_jsonb(OLD)-velden-ARRAY['updated_at']) IS DISTINCT FROM (to_jsonb(NEW)-velden-ARRAY['updated_at']) THEN
 RAISE EXCEPTION 'Beheer ontgrendelen nodig' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN NEW;
 END $$;
CREATE TRIGGER phase1_station_fields BEFORE INSERT OR UPDATE ON public.stations FOR EACH ROW EXECUTE FUNCTION public.bewaak_station();
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['fotos','categorie_opmerkingen','categorie_skips'] LOOP
 EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO anon,authenticated',t);
 EXECUTE format('CREATE POLICY phase1_insert ON public.%I FOR INSERT TO anon,authenticated WITH CHECK(public.fotowerk_toegestaan(station_id))',t);
 EXECUTE format('CREATE POLICY phase1_update ON public.%I FOR UPDATE TO anon,authenticated USING(public.fotowerk_toegestaan(station_id)) WITH CHECK(public.fotowerk_toegestaan(station_id))',t);
 IF t='fotos' THEN
 EXECUTE format('CREATE POLICY phase1_delete ON public.%I FOR DELETE TO authenticated USING(public.heeft_beheer())',t);
 ELSE
 EXECUTE format('CREATE POLICY phase1_delete ON public.%I FOR DELETE TO anon,authenticated USING(public.fotowerk_toegestaan(station_id))',t);
 END IF;
 END LOOP; END $$;
CREATE FUNCTION public.bewaak_fotowerk() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
 DECLARE sid uuid;
 BEGIN
 IF auth.role()='service_role' OR current_user='postgres' THEN RETURN coalesce(NEW,OLD); END IF;
 IF TG_OP='DELETE' AND public.heeft_beheer() THEN RETURN OLD; END IF;
 sid:=CASE WHEN TG_OP='DELETE' THEN OLD.station_id ELSE NEW.station_id END;
 PERFORM 1 FROM public.stations WHERE id=sid FOR UPDATE;
 IF TG_OP='UPDATE' AND OLD.station_id IS DISTINCT FROM NEW.station_id THEN RAISE EXCEPTION 'Verplaatsen niet toegestaan' USING ERRCODE='42501'; END IF;
 IF NOT public.fotowerk_toegestaan(sid) THEN RAISE EXCEPTION 'Beheer ontgrendelen nodig' USING ERRCODE='42501'; END IF;
 IF TG_TABLE_NAME='fotos' THEN
 IF TG_OP='DELETE' AND NOT public.heeft_beheer() THEN RAISE EXCEPTION 'PIN nodig' USING ERRCODE='42501'; END IF;
 IF TG_OP='UPDATE' AND (OLD.storage_path IS DISTINCT FROM NEW.storage_path OR OLD.url IS DISTINCT FROM NEW.url OR OLD.id IS DISTINCT FROM NEW.id) THEN RAISE EXCEPTION 'Fotobron is onveranderlijk' USING ERRCODE='42501'; END IF;
 IF NOT public.heeft_beheer() AND ((TG_OP='INSERT' AND (NEW.review_status<>'pending' OR NEW.review_reden IS NOT NULL OR NEW.reviewed_at IS NOT NULL))
 OR (TG_OP='UPDATE' AND (to_jsonb(OLD)-ARRAY['volgorde','gps_afstand_m','scherpte']) IS DISTINCT FROM (to_jsonb(NEW)-ARRAY['volgorde','gps_afstand_m','scherpte']))) THEN
 RAISE EXCEPTION 'Beheer ontgrendelen nodig' USING ERRCODE='42501'; END IF;
 IF TG_OP<>'DELETE' AND (split_part(NEW.storage_path,'/',1)<>'stations' OR split_part(NEW.storage_path,'/',2)<>NEW.station_id::text OR NEW.storage_path LIKE '%..%'
 OR NEW.url IS DISTINCT FROM 'https://aiwpseouqechfsvagxkc.supabase.co/storage/v1/object/public/to-fotos/'||NEW.storage_path) THEN RAISE EXCEPTION 'Ongeldige fotobron' USING ERRCODE='22023'; END IF;
 END IF;
 RETURN coalesce(NEW,OLD);
 END $$;
CREATE TRIGGER phase1_photo_fields BEFORE INSERT OR UPDATE OR DELETE ON public.fotos FOR EACH ROW EXECUTE FUNCTION public.bewaak_fotowerk();
CREATE TRIGGER phase1_notes BEFORE INSERT OR UPDATE OR DELETE ON public.categorie_opmerkingen FOR EACH ROW EXECUTE FUNCTION public.bewaak_fotowerk();
CREATE TRIGGER phase1_skips BEFORE INSERT OR UPDATE OR DELETE ON public.categorie_skips FOR EACH ROW EXECUTE FUNCTION public.bewaak_fotowerk();
CREATE FUNCTION public.foto_pad_toegestaan(_pad text) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
 DECLARE sid uuid;
 BEGIN
 IF public.heeft_beheer() AND _pad NOT LIKE 'stations/%' THEN RETURN true; END IF;
 IF split_part(_pad,'/',1)<>'stations' OR _pad LIKE '%..%' THEN RETURN false; END IF;
 BEGIN sid:=split_part(_pad,'/',2)::uuid; EXCEPTION WHEN invalid_text_representation THEN RETURN false; END;
 RETURN public.fotowerk_toegestaan(sid);
 END $$;
REVOKE ALL ON FUNCTION public.foto_pad_toegestaan(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.foto_pad_toegestaan(text) TO anon,authenticated,service_role;
DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND cmd<>'SELECT' LOOP
 EXECUTE format('DROP POLICY %I ON storage.objects',p.policyname); END LOOP;
 END $$;
CREATE POLICY phase1_photo_upload ON storage.objects FOR INSERT TO anon,authenticated WITH CHECK(bucket_id='to-fotos' AND public.foto_pad_toegestaan(name));
CREATE POLICY phase1_storage_admin_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK(public.heeft_beheer() AND bucket_id='branding');
CREATE POLICY phase1_storage_admin_delete ON storage.objects FOR DELETE TO authenticated USING(public.heeft_beheer() AND bucket_id IN ('to-fotos','branding'));
REVOKE EXECUTE ON FUNCTION public.maak_case(text,text,public.case_uitvoerder,text,text,integer,text,date,boolean,text) FROM anon;
CREATE FUNCTION public.vereiste_fotocategorieen(_station public.stations) RETURNS TABLE(id integer,naam text,minimum integer) LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT * FROM (VALUES
(1, 'Typeplaatje / fabricagenummer', 1),
(2, 'Ruimte overzicht (Buiten)', 1),
(3, 'Deuren met stationsbenaming', 1),
(4, 'Lips-sloten', 1),
(5, 'Overzicht binnenzijde (LS & MS)', 1),
(6, 'Foto Kelder', 1),
(7, 'Overzichtsfoto kabelinvoer', 1),
(43, 'Asbest registratieformulier', 1),
(8, 'Overzicht MS installatie', 1),
(9, 'Foto per veld', 1),
(10, 'LS-Deel voorzijde', 1),
(11, 'Manometer', 1),
(12, 'Typeplaatje', 1),
(13, 'Kabels boven de MS-installatie', 1),
(14, 'Stroomtrafo''s vermogensveld', 1),
(15, 'DA-kast voor- en binnenzijde', 1),
(16, 'Eindsluitingen', 1),
(17, 'Vloerbeugels', 1),
(18, 'Trafo overzicht', 1),
(19, 'Trafo typeplaatje', 1),
(20, 'Trafo thermometer', 1),
(21, 'Trafo aansluitingen MS', 1),
(22, 'Trafo aansluitingen LS', 1),
(23, 'Trafo aarding', 1),
(24, 'LS-rek overzicht', 1),
(25, 'LS-rek typeplaatje', 1),
(26, 'LS-rek kabels', 1),
(27, 'LS-rek aarding', 1),
(28, 'LS-rek zekeringen', 1),
(29, 'Meting overzicht', 1),
(30, 'Meters', 1),
(31, 'Stroomtransformatoren', 1),
(32, 'OVL-rek overzicht', 1),
(33, 'OVL zekeringen', 1),
(34, 'OVL meters', 1),
(35, 'OVL kabels', 1),
(36, 'Verlichting', 1),
(37, 'Wandcontactdozen', 1),
(38, 'Aarding', 1),
(39, 'Ringleiding', 1),
(40, 'Ventilatie', 1),
(42, 'Meterkast', 1),
(41, 'NSA-Luik', 1)
 ) AS c(id,naam,minimum) WHERE (c.id<>1 OR _station.type_ruimte IS DISTINCT FROM 'Betreedbaar station') AND (c.id<>14 OR coalesce(_station.vermogensveld,false)) AND (c.id<>15 OR coalesce(_station.da_kast,false));
$$;
REVOKE ALL ON FUNCTION public.vereiste_fotocategorieen(public.stations) FROM PUBLIC;
CREATE FUNCTION public.fotodossier_aanbieden(_station_id uuid,_opdrachtgever text DEFAULT NULL,_submitted_by text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
 DECLARE s public.stations; rid uuid; BEGIN
 SELECT * INTO s FROM public.stations WHERE id=_station_id FOR UPDATE;
 IF NOT FOUND OR s.uitvoerder<>'terrevolt' THEN RAISE EXCEPTION 'Geen fotostation' USING ERRCODE='22023'; END IF;
 IF length(coalesce(_opdrachtgever,''))>200 OR length(coalesce(_submitted_by,''))>200 THEN RAISE EXCEPTION 'Invoer te lang' USING ERRCODE='22023'; END IF;
 SELECT id INTO rid FROM public.opleverruns WHERE station_id=s.id AND status NOT IN ('afgerond','mislukt');
 IF rid IS NOT NULL THEN RETURN jsonb_build_object('id',rid,'nieuw',false); END IF;
 IF NOT public.heeft_beheer() AND NOT (s.status IN ('concept','in uitvoering','afgekeurd') AND s.submitted_at IS NULL) THEN RAISE EXCEPTION 'Beheer ontgrendelen nodig' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM public.vereiste_fotocategorieen(s) c WHERE
 (SELECT count(*) FROM public.fotos f WHERE f.station_id=s.id AND f.categorie=c.naam AND f.review_status<>'rejected') < c.minimum
 AND NOT EXISTS(SELECT 1 FROM public.categorie_skips k WHERE k.station_id=s.id AND k.categorie=c.naam AND length(btrim(k.reden))>0)) THEN
 RAISE EXCEPTION 'Fotodossier is niet compleet' USING ERRCODE='22023'; END IF;
 UPDATE public.stations SET status='opgeleverd',submitted_at=clock_timestamp(),submitted_by=coalesce(nullif(btrim(_submitted_by),''),s.ingevuld_door,'Onbekend'),opdrachtgever=coalesce(nullif(btrim(_opdrachtgever),''),s.opdrachtgever),review_reden=NULL WHERE id=s.id;
 UPDATE public.fotos SET review_status='pending',review_reden=NULL WHERE station_id=s.id AND review_status<>'approved';
 INSERT INTO public.opleverruns(station_id,status,aangevraagd_door) VALUES(s.id,'aangevraagd',coalesce(nullif(btrim(_submitted_by),''),s.ingevuld_door,'Onbekend')) RETURNING id INTO rid;
 RETURN jsonb_build_object('id',rid,'nieuw',true);
 END $$;
REVOKE ALL ON FUNCTION public.fotodossier_aanbieden(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fotodossier_aanbieden(uuid,text,text) TO anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.opleverrun_claim(uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.opleverrun_claim(uuid,integer) TO service_role;
CREATE FUNCTION public.categorienotitie_opslaan(_station_id uuid,_categorie text,_tekst text) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 IF NOT public.fotowerk_toegestaan(_station_id) THEN RAISE EXCEPTION 'Beheer vergrendeld of verlopen' USING ERRCODE='42501'; END IF;
 IF length(_categorie)>300 OR length(_tekst)>10000 OR btrim(_categorie)='' THEN RAISE EXCEPTION 'Ongeldige notitie' USING ERRCODE='22023'; END IF;
 IF btrim(_tekst)='' THEN DELETE FROM public.categorie_opmerkingen WHERE station_id=_station_id AND categorie=_categorie;
 ELSE INSERT INTO public.categorie_opmerkingen(station_id,categorie,opmerking) VALUES(_station_id,_categorie,btrim(_tekst)) ON CONFLICT(station_id,categorie) DO UPDATE SET opmerking=EXCLUDED.opmerking,updated_at=clock_timestamp(); END IF;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.categorienotitie_opslaan(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.categorienotitie_opslaan(uuid,text,text) TO anon,authenticated;