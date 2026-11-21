ALTER TABLE public.fotos ADD COLUMN IF NOT EXISTS review_versie bigint NOT NULL DEFAULT 0;
ALTER TABLE public.fotos ADD COLUMN IF NOT EXISTS afkeur_afgehandeld_op timestamptz;
ALTER TABLE public.fotos ADD COLUMN IF NOT EXISTS afkeur_afgehandeld_toelichting text;
COMMENT ON COLUMN public.fotos.afkeur_afgehandeld_op IS 'Explicit office resolution of a historical rejection; never inferred or backfilled';

CREATE OR REPLACE FUNCTION public.foto_review_versie() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF TG_OP='INSERT' THEN NEW.review_versie:=0; NEW.afkeur_afgehandeld_op:=NULL; NEW.afkeur_afgehandeld_toelichting:=NULL; RETURN NEW; END IF;
 IF NEW.review_status<>'rejected' THEN NEW.afkeur_afgehandeld_op:=NULL; NEW.afkeur_afgehandeld_toelichting:=NULL; END IF;
 IF (OLD.review_status,OLD.review_reden,OLD.reviewed_at,OLD.afkeur_afgehandeld_op,OLD.afkeur_afgehandeld_toelichting) IS DISTINCT FROM (NEW.review_status,NEW.review_reden,NEW.reviewed_at,NEW.afkeur_afgehandeld_op,NEW.afkeur_afgehandeld_toelichting)
 THEN NEW.review_versie:=OLD.review_versie+1; ELSE NEW.review_versie:=OLD.review_versie; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS zz_foto_review_versie ON public.fotos;
CREATE TRIGGER zz_foto_review_versie BEFORE INSERT OR UPDATE ON public.fotos FOR EACH ROW EXECUTE FUNCTION public.foto_review_versie();

CREATE TABLE public.foto_beoordelingen(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 foto_id uuid NOT NULL, station_id uuid NOT NULL,
 actie text NOT NULL CHECK (actie IN ('goedgekeurd','afgekeurd','afkeur_afgehandeld','hersteld')),
 oud jsonb NOT NULL, nieuw jsonb NOT NULL,
 oud_versie bigint NOT NULL, nieuw_versie bigint NOT NULL,
 oud_station jsonb NOT NULL, nieuw_station jsonb NOT NULL,
 door uuid, sessie uuid,
 op timestamptz NOT NULL DEFAULT clock_timestamp(),
 hersteld_op timestamptz, herstel_van uuid REFERENCES public.foto_beoordelingen(id)
);
CREATE INDEX foto_beoordelingen_foto ON public.foto_beoordelingen(foto_id, op);
CREATE INDEX foto_beoordelingen_station ON public.foto_beoordelingen(station_id, op);
REVOKE ALL ON public.foto_beoordelingen FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.foto_beoordelingen TO authenticated;
GRANT ALL ON public.foto_beoordelingen TO service_role;
ALTER TABLE public.foto_beoordelingen ENABLE ROW LEVEL SECURITY;
CREATE POLICY foto_beoordelingen_beheer_lezen ON public.foto_beoordelingen FOR SELECT TO authenticated USING (public.heeft_beheer());

CREATE OR REPLACE FUNCTION public.foto_beoordeling_staat(f public.fotos) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT jsonb_build_object('review_status',f.review_status,'review_reden',f.review_reden,'reviewed_at',f.reviewed_at,'afkeur_afgehandeld_op',f.afkeur_afgehandeld_op,'afkeur_afgehandeld_toelichting',f.afkeur_afgehandeld_toelichting)
$$;

CREATE OR REPLACE FUNCTION public.dossier_eindcontrole(_station_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object(
  'station_status',s.status,
  'te_beoordelen',(SELECT count(*) FROM public.fotos f WHERE f.station_id=s.id AND f.review_status='pending'),
  'open_afkeuren',(SELECT count(*) FROM public.fotos f WHERE f.station_id=s.id AND f.review_status='rejected' AND f.afkeur_afgehandeld_op IS NULL),
  'afgehandelde_afkeuren',(SELECT count(*) FROM public.fotos f WHERE f.station_id=s.id AND f.review_status='rejected' AND f.afkeur_afgehandeld_op IS NOT NULL),
  'goedgekeurd',(SELECT count(*) FROM public.fotos f WHERE f.station_id=s.id AND f.review_status='approved'),
  'ontbrekend',coalesce((SELECT jsonb_agg(c.naam ORDER BY c.id) FROM public.vereiste_fotocategorieen(s) c
    WHERE (SELECT count(*) FROM public.fotos f WHERE f.station_id=s.id AND f.categorie=c.naam AND f.review_status='approved')<c.minimum
    AND NOT EXISTS(SELECT 1 FROM public.fotos f WHERE f.station_id=s.id AND f.categorie=c.naam AND f.review_status='pending')
    AND NOT EXISTS(SELECT 1 FROM public.categorie_skips k WHERE k.station_id=s.id AND k.categorie=c.naam AND length(btrim(k.reden))>0)),'[]'::jsonb))
 FROM public.stations s WHERE s.id=_station_id AND s.uitvoerder='terrevolt'
$$;

CREATE OR REPLACE FUNCTION public.foto_beoordelen(_foto_id uuid,_verwacht_versie bigint,_besluit text,_reden text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE f public.fotos; s public.stations; n public.fotos; ns public.stations; hid uuid; r text:=nullif(btrim(coalesce(_reden,'')),'');
BEGIN
 IF NOT public.heeft_beheer() THEN RAISE EXCEPTION 'Beheer ontgrendelen nodig' USING ERRCODE='42501'; END IF;
 IF _besluit NOT IN ('approved','rejected','afgehandeld') THEN RAISE EXCEPTION 'Ongeldig besluit' USING ERRCODE='22023'; END IF;
 IF _besluit IN ('rejected','afgehandeld') AND r IS NULL THEN RAISE EXCEPTION 'Reden is verplicht' USING ERRCODE='22023'; END IF;
 IF length(coalesce(r,''))>500 THEN RAISE EXCEPTION 'Reden te lang' USING ERRCODE='22023'; END IF;
 SELECT * INTO f FROM public.fotos WHERE id=_foto_id;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reden','niet_gevonden'); END IF;
 SELECT * INTO s FROM public.stations WHERE id=f.station_id FOR UPDATE;
 SELECT * INTO f FROM public.fotos WHERE id=_foto_id FOR UPDATE;
 IF s.uitvoerder<>'terrevolt' THEN RAISE EXCEPTION 'Geen fotostation' USING ERRCODE='22023'; END IF;
 IF s.submitted_at IS NULL OR s.status='goedgekeurd' THEN RETURN jsonb_build_object('ok',false,'reden','dossierstatus','station_status',s.status); END IF;
 IF _verwacht_versie IS NULL OR f.review_versie<>_verwacht_versie THEN RETURN jsonb_build_object('ok',false,'reden','gewijzigd','foto',public.foto_beoordeling_staat(f),'versie',f.review_versie); END IF;
 IF _besluit='afgehandeld' AND (f.review_status<>'rejected' OR f.afkeur_afgehandeld_op IS NOT NULL) THEN RETURN jsonb_build_object('ok',false,'reden','geen_open_afkeur'); END IF;
 IF _besluit='afgehandeld' THEN
  UPDATE public.fotos SET afkeur_afgehandeld_op=clock_timestamp(),afkeur_afgehandeld_toelichting=r WHERE id=f.id RETURNING * INTO n;
 ELSE
  UPDATE public.fotos SET review_status=_besluit,review_reden=CASE WHEN _besluit='rejected' THEN r END,reviewed_at=clock_timestamp() WHERE id=f.id RETURNING * INTO n;
 END IF;
 IF _besluit='rejected' THEN UPDATE public.stations SET status='in uitvoering',review_reden=r WHERE id=s.id RETURNING * INTO ns; ELSE ns:=s; END IF;
 INSERT INTO public.foto_beoordelingen(foto_id,station_id,actie,oud,nieuw,oud_versie,nieuw_versie,oud_station,nieuw_station,door,sessie)
 VALUES(f.id,s.id,CASE _besluit WHEN 'approved' THEN 'goedgekeurd' WHEN 'rejected' THEN 'afgekeurd' ELSE 'afkeur_afgehandeld' END,
  public.foto_beoordeling_staat(f),public.foto_beoordeling_staat(n),f.review_versie,n.review_versie,
  jsonb_build_object('status',s.status,'review_reden',s.review_reden),jsonb_build_object('status',ns.status,'review_reden',ns.review_reden),
  auth.uid(),nullif(auth.jwt()->>'session_id','')::uuid) RETURNING id INTO hid;
 RETURN jsonb_build_object('ok',true,'beoordeling_id',hid,'versie',n.review_versie,'foto',public.foto_beoordeling_staat(n),'station_status',ns.status);
END $$;

CREATE OR REPLACE FUNCTION public.foto_beoordeling_herstellen(_beoordeling_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE h public.foto_beoordelingen; f public.fotos; s public.stations; n public.fotos; ns public.stations; hid uuid; station_terug boolean:=false;
BEGIN
 IF NOT public.heeft_beheer() THEN RAISE EXCEPTION 'Beheer ontgrendelen nodig' USING ERRCODE='42501'; END IF;
 SELECT * INTO h FROM public.foto_beoordelingen WHERE id=_beoordeling_id;
 IF NOT FOUND OR h.actie='hersteld' THEN RETURN jsonb_build_object('ok',false,'reden','niet_gevonden'); END IF;
 IF h.door IS DISTINCT FROM auth.uid() OR h.sessie IS DISTINCT FROM nullif(auth.jwt()->>'session_id','')::uuid THEN RETURN jsonb_build_object('ok',false,'reden','niet_eigen'); END IF;
 SELECT * INTO s FROM public.stations WHERE id=h.station_id FOR UPDATE;
 SELECT * INTO h FROM public.foto_beoordelingen WHERE id=_beoordeling_id FOR UPDATE;
 IF h.hersteld_op IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'reden','al_hersteld'); END IF;
 SELECT * INTO f FROM public.fotos WHERE id=h.foto_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reden','niet_gevonden'); END IF;
 IF f.review_versie<>h.nieuw_versie OR public.foto_beoordeling_staat(f)<>h.nieuw THEN RETURN jsonb_build_object('ok',false,'reden','gewijzigd','foto',public.foto_beoordeling_staat(f),'versie',f.review_versie); END IF;
 IF s.status='goedgekeurd' THEN RETURN jsonb_build_object('ok',false,'reden','dossierstatus','station_status',s.status); END IF;
 UPDATE public.fotos SET review_status=h.oud->>'review_status',review_reden=h.oud->>'review_reden',reviewed_at=(h.oud->>'reviewed_at')::timestamptz,
  afkeur_afgehandeld_op=(h.oud->>'afkeur_afgehandeld_op')::timestamptz,afkeur_afgehandeld_toelichting=h.oud->>'afkeur_afgehandeld_toelichting' WHERE id=f.id RETURNING * INTO n;
 ns:=s;
 IF h.oud_station<>h.nieuw_station THEN
  IF s.status IS NOT DISTINCT FROM h.nieuw_station->>'status' AND s.review_reden IS NOT DISTINCT FROM h.nieuw_station->>'review_reden'
   AND NOT EXISTS(SELECT 1 FROM public.fotos o WHERE o.station_id=s.id AND o.id<>f.id AND o.review_status='rejected' AND o.reviewed_at>=h.op) THEN
   UPDATE public.stations SET status=h.oud_station->>'status',review_reden=h.oud_station->>'review_reden' WHERE id=s.id RETURNING * INTO ns; station_terug:=true;
  END IF;
 END IF;
 UPDATE public.foto_beoordelingen SET hersteld_op=clock_timestamp() WHERE id=h.id;
 INSERT INTO public.foto_beoordelingen(foto_id,station_id,actie,oud,nieuw,oud_versie,nieuw_versie,oud_station,nieuw_station,door,sessie,herstel_van)
 VALUES(f.id,s.id,'hersteld',public.foto_beoordeling_staat(f),public.foto_beoordeling_staat(n),f.review_versie,n.review_versie,
  jsonb_build_object('status',s.status,'review_reden',s.review_reden),jsonb_build_object('status',ns.status,'review_reden',ns.review_reden),
  auth.uid(),nullif(auth.jwt()->>'session_id','')::uuid,h.id) RETURNING id INTO hid;
 RETURN jsonb_build_object('ok',true,'versie',n.review_versie,'foto',public.foto_beoordeling_staat(n),'station_status',ns.status,'station_hersteld',station_terug OR h.oud_station=h.nieuw_station);
END $$;

CREATE OR REPLACE FUNCTION public.dossier_afronden(_station_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.stations; c jsonb;
BEGIN
 IF NOT public.heeft_beheer() THEN RAISE EXCEPTION 'Beheer ontgrendelen nodig' USING ERRCODE='42501'; END IF;
 SELECT * INTO s FROM public.stations WHERE id=_station_id FOR UPDATE;
 IF NOT FOUND OR s.uitvoerder<>'terrevolt' THEN RAISE EXCEPTION 'Geen fotostation' USING ERRCODE='22023'; END IF;
 IF s.status='goedgekeurd' THEN RETURN jsonb_build_object('ok',true,'al_afgerond',true); END IF;
 c:=public.dossier_eindcontrole(_station_id);
 IF s.status<>'opgeleverd' OR (c->>'te_beoordelen')::int>0 OR (c->>'open_afkeuren')::int>0 OR jsonb_array_length(c->'ontbrekend')>0 THEN
  RETURN jsonb_build_object('ok',false,'reden','eindcontrole','controle',c);
 END IF;
 UPDATE public.stations SET status='goedgekeurd',review_reden=NULL WHERE id=s.id;
 RETURN jsonb_build_object('ok',true,'al_afgerond',false);
END $$;

CREATE OR REPLACE FUNCTION public.fotodossier_aanbieden(_station_id uuid,_opdrachtgever text DEFAULT NULL,_submitted_by text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.stations; rid uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('verwerking:'||_station_id));
 SELECT * INTO s FROM public.stations WHERE id=_station_id FOR UPDATE;
 IF NOT FOUND OR s.uitvoerder<>'terrevolt' THEN RAISE EXCEPTION 'Geen fotostation' USING ERRCODE='22023'; END IF;
 IF length(coalesce(_opdrachtgever,''))>200 OR length(coalesce(_submitted_by,''))>200 THEN RAISE EXCEPTION 'Invoer te lang' USING ERRCODE='22023'; END IF;
 SELECT id INTO rid FROM public.opleverruns WHERE station_id=s.id AND status NOT IN ('afgerond','mislukt');
 IF rid IS NOT NULL THEN RETURN jsonb_build_object('id',rid,'nieuw',false); END IF;
 IF EXISTS(SELECT 1 FROM public.station_verwerking WHERE station_id=s.id AND eigenaar IS NOT NULL AND geldig_tot>clock_timestamp()) THEN RAISE EXCEPTION 'Station wordt verwerkt' USING ERRCODE='55000'; END IF;
 IF NOT public.heeft_beheer() AND NOT(s.status IN ('concept','in uitvoering','afgekeurd') AND s.submitted_at IS NULL) THEN RAISE EXCEPTION 'Beheer ontgrendelen nodig' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM public.vereiste_fotocategorieen(s) c WHERE (SELECT count(*) FROM public.fotos f JOIN storage.objects o ON o.bucket_id='to-fotos' AND o.name=f.storage_path WHERE f.station_id=s.id AND f.categorie=c.naam AND f.review_status<>'rejected')<c.minimum AND NOT EXISTS(SELECT 1 FROM public.categorie_skips k WHERE k.station_id=s.id AND k.categorie=c.naam AND length(btrim(k.reden))>0)) THEN RAISE EXCEPTION 'Fotodossier is niet compleet' USING ERRCODE='22023'; END IF;
 INSERT INTO public.opleverruns(station_id,status,aangevraagd_door) VALUES(s.id,'aangevraagd',coalesce(nullif(btrim(_submitted_by),''),s.ingevuld_door,'Onbekend')) RETURNING id INTO rid;
 UPDATE public.stations SET status='opgeleverd',submitted_at=clock_timestamp(),submitted_by=coalesce(nullif(btrim(_submitted_by),''),s.ingevuld_door,'Onbekend'),opdrachtgever=coalesce(nullif(btrim(_opdrachtgever),''),s.opdrachtgever),review_reden=NULL WHERE id=s.id;
 UPDATE public.opleverruns SET dossier=public.dossier_snapshot(s.id) WHERE id=rid;
 RETURN jsonb_build_object('id',rid,'nieuw',true);
END $$;
CREATE OR REPLACE FUNCTION public.dossier_snapshot(_station_id uuid) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object('station',to_jsonb(s),'fotos',coalesce((SELECT jsonb_agg(to_jsonb(f) ORDER BY f.categorie,f.volgorde,f.id) FROM public.fotos f WHERE f.station_id=s.id AND f.review_status<>'rejected'),'[]'::jsonb),'opmerkingen',coalesce((SELECT jsonb_agg(to_jsonb(o)) FROM public.categorie_opmerkingen o WHERE o.station_id=s.id),'[]'::jsonb),'skips',coalesce((SELECT jsonb_agg(to_jsonb(k)) FROM public.categorie_skips k WHERE k.station_id=s.id),'[]'::jsonb),'instellingen',coalesce((SELECT to_jsonb(i) FROM public.instellingen i LIMIT 1),'{}'::jsonb),'acties',coalesce((SELECT jsonb_agg(to_jsonb(a)) FROM public.to_acties a WHERE a.station_id=s.id AND a.afgehandeld_op IS NULL),'[]'::jsonb),'vereisten',coalesce((SELECT jsonb_agg(to_jsonb(c)) FROM public.vereiste_fotocategorieen(s) c),'[]'::jsonb)) FROM public.stations s WHERE s.id=_station_id
$$;
REVOKE ALL ON FUNCTION public.foto_beoordelen(uuid,bigint,text,text),public.foto_beoordeling_herstellen(uuid),public.dossier_afronden(uuid),public.dossier_eindcontrole(uuid),public.foto_beoordeling_staat(public.fotos),public.foto_review_versie() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.foto_beoordelen(uuid,bigint,text,text),public.foto_beoordeling_herstellen(uuid),public.dossier_afronden(uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.dossier_eindcontrole(uuid) TO anon,authenticated,service_role;