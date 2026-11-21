CREATE OR REPLACE FUNCTION public.bewaak_fotowerk() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
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
 IF TG_OP='INSERT' AND (split_part(NEW.storage_path,'/',1)<>'stations' OR split_part(NEW.storage_path,'/',2)<>NEW.station_id::text OR NEW.storage_path LIKE '%..%'
 OR NEW.url IS DISTINCT FROM 'https://aiwpseouqechfsvagxkc.supabase.co/storage/v1/object/public/to-fotos/'||NEW.storage_path) THEN RAISE EXCEPTION 'Ongeldige fotobron' USING ERRCODE='22023'; END IF;
 IF TG_OP='INSERT' AND NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='to-fotos' AND name=NEW.storage_path) THEN RAISE EXCEPTION 'Foto ontbreekt in opslag' USING ERRCODE='22023'; END IF;
 END IF;
 IF TG_TABLE_NAME='categorie_skips' AND TG_OP<>'DELETE' THEN
 IF length(btrim(NEW.reden))=0 THEN RAISE EXCEPTION 'Reden is verplicht' USING ERRCODE='22023'; END IF;
 END IF;
 RETURN coalesce(NEW,OLD);
 END $$;
CREATE OR REPLACE FUNCTION public.fotodossier_aanbieden(_station_id uuid,_opdrachtgever text DEFAULT NULL,_submitted_by text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
 DECLARE s public.stations; rid uuid; BEGIN
 SELECT * INTO s FROM public.stations WHERE id=_station_id FOR UPDATE;
 IF NOT FOUND OR s.uitvoerder<>'terrevolt' THEN RAISE EXCEPTION 'Geen fotostation' USING ERRCODE='22023'; END IF;
 IF length(coalesce(_opdrachtgever,''))>200 OR length(coalesce(_submitted_by,''))>200 THEN RAISE EXCEPTION 'Invoer te lang' USING ERRCODE='22023'; END IF;
 SELECT id INTO rid FROM public.opleverruns WHERE station_id=s.id AND status NOT IN ('afgerond','mislukt');
 IF rid IS NOT NULL THEN RETURN jsonb_build_object('id',rid,'nieuw',false); END IF;
 IF NOT public.heeft_beheer() AND NOT (s.status IN ('concept','in uitvoering','afgekeurd') AND s.submitted_at IS NULL) THEN RAISE EXCEPTION 'Beheer ontgrendelen nodig' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM public.vereiste_fotocategorieen(s) c WHERE
 (SELECT count(*) FROM public.fotos f JOIN storage.objects o ON o.bucket_id='to-fotos' AND o.name=f.storage_path WHERE f.station_id=s.id AND f.categorie=c.naam AND f.review_status<>'rejected') < c.minimum
 AND NOT EXISTS(SELECT 1 FROM public.categorie_skips k WHERE k.station_id=s.id AND k.categorie=c.naam AND length(btrim(k.reden))>0)) THEN
 RAISE EXCEPTION 'Fotodossier is niet compleet' USING ERRCODE='22023'; END IF;
 UPDATE public.stations SET status='opgeleverd',submitted_at=clock_timestamp(),submitted_by=coalesce(nullif(btrim(_submitted_by),''),s.ingevuld_door,'Onbekend'),opdrachtgever=coalesce(nullif(btrim(_opdrachtgever),''),s.opdrachtgever),review_reden=NULL WHERE id=s.id;
 UPDATE public.fotos SET review_status='pending',review_reden=NULL WHERE station_id=s.id AND review_status<>'approved';
 INSERT INTO public.opleverruns(station_id,status,aangevraagd_door) VALUES(s.id,'aangevraagd',coalesce(nullif(btrim(_submitted_by),''),s.ingevuld_door,'Onbekend')) RETURNING id INTO rid;
 RETURN jsonb_build_object('id',rid,'nieuw',true);
 END $$;