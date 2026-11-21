CREATE TABLE public.station_verwerking (station_id uuid PRIMARY KEY, eigenaar uuid, generatie bigint NOT NULL DEFAULT 0, geldig_tot timestamptz);
GRANT ALL ON public.station_verwerking TO service_role;
REVOKE ALL ON public.station_verwerking FROM anon, authenticated;
ALTER TABLE public.station_verwerking ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opleverruns ADD COLUMN dossier jsonb, ADD COLUMN pdf_pad text, ADD COLUMN pdf_hash text, ADD COLUMN html_pad text;
ALTER TABLE public.rapport_pdf ADD COLUMN geaccepteerde_run uuid, ADD COLUMN pdf_pad text, ADD COLUMN pdf_hash text;
ALTER TABLE public.sharepoint_sync ADD COLUMN pdf_run uuid, ADD COLUMN pdf_hash text;
CREATE TABLE public.sharepoint_wachtrij (station_id uuid PRIMARY KEY, alleen_status boolean NOT NULL DEFAULT false, volgende_poging_op timestamptz NOT NULL DEFAULT now(), fout text, poging integer NOT NULL DEFAULT 0);
GRANT ALL ON public.sharepoint_wachtrij TO service_role;
GRANT SELECT ON public.sharepoint_wachtrij TO anon, authenticated;
ALTER TABLE public.sharepoint_wachtrij ENABLE ROW LEVEL SECURITY;
CREATE POLICY wachtrij_read ON public.sharepoint_wachtrij FOR SELECT TO anon,authenticated USING(true);
CREATE TABLE public.case_aanvragen (request_id uuid PRIMARY KEY, user_id uuid NOT NULL, session_id text NOT NULL, payload jsonb NOT NULL, station_id uuid NOT NULL);
GRANT ALL ON public.case_aanvragen TO service_role;
REVOKE ALL ON public.case_aanvragen FROM anon, authenticated;
ALTER TABLE public.case_aanvragen ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.station_claim(_station_id uuid,_eigenaar uuid,_run uuid DEFAULT NULL,_seconden integer DEFAULT 90) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE g bigint;
BEGIN
 IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'Alleen server' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('verwerking:'||_station_id));
 IF EXISTS(SELECT 1 FROM public.opleverruns WHERE station_id=_station_id AND status NOT IN ('afgerond','mislukt') AND id IS DISTINCT FROM _run) THEN RETURN NULL; END IF;
 INSERT INTO public.station_verwerking(station_id) VALUES(_station_id) ON CONFLICT DO NOTHING;
 UPDATE public.station_verwerking SET eigenaar=_eigenaar,generatie=generatie+1,geldig_tot=clock_timestamp()+make_interval(secs=>least(300,greatest(10,_seconden))) WHERE station_id=_station_id AND (eigenaar IS NULL OR geldig_tot<=clock_timestamp()) RETURNING generatie INTO g;
 RETURN g;
END $$;
CREATE OR REPLACE FUNCTION public.station_claim_check(_station_id uuid,_eigenaar uuid,_generatie bigint,_vrijgeven boolean DEFAULT false) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'Alleen server' USING ERRCODE='42501'; END IF;
 UPDATE public.station_verwerking SET eigenaar=CASE WHEN _vrijgeven THEN NULL ELSE eigenaar END,geldig_tot=CASE WHEN _vrijgeven THEN NULL ELSE clock_timestamp()+interval '90 seconds' END WHERE station_id=_station_id AND eigenaar=_eigenaar AND generatie=_generatie AND geldig_tot>clock_timestamp();
 RETURN FOUND;
END $$;
CREATE OR REPLACE FUNCTION public.verwerking_opslaan(_station_id uuid,_eigenaar uuid,_generatie bigint,_run uuid DEFAULT NULL,_run_patch jsonb DEFAULT NULL,_pdf_patch jsonb DEFAULT NULL,_sync_patch jsonb DEFAULT NULL) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.opleverruns; p public.rapport_pdf; s public.sharepoint_sync;
BEGIN
 IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'Alleen server' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.station_verwerking WHERE station_id=_station_id AND eigenaar=_eigenaar AND generatie=_generatie AND geldig_tot>clock_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 IF _run IS NOT NULL THEN
 SELECT * INTO r FROM public.opleverruns WHERE id=_run AND station_id=_station_id FOR UPDATE;
 IF NOT FOUND OR EXISTS(SELECT 1 FROM public.opleverruns WHERE station_id=_station_id AND id<>_run AND status NOT IN ('afgerond','mislukt')) THEN RETURN false; END IF;
 IF _run_patch IS NOT NULL THEN
 r:=jsonb_populate_record(r,_run_patch);
 UPDATE public.opleverruns SET status=r.status,retry_stap=r.retry_stap,poging=r.poging,volgende_poging_op=r.volgende_poging_op,pdf_run=r.pdf_run,fout=r.fout,stap_fouten=r.stap_fouten,afgerond_op=r.afgerond_op,pdf_pad=r.pdf_pad,pdf_hash=r.pdf_hash,html_pad=r.html_pad WHERE id=_run;
 END IF;
 END IF;
 IF _pdf_patch IS NOT NULL THEN
 SELECT * INTO p FROM public.rapport_pdf WHERE station_id=_station_id;
 p:=jsonb_populate_record(p,_pdf_patch);
 INSERT INTO public.rapport_pdf(station_id,status,fout,bytes,paginas,fotos,gestart_op,klaar_op,geaccepteerde_run,pdf_pad,pdf_hash) VALUES(_station_id,p.status,p.fout,p.bytes,p.paginas,p.fotos,coalesce(p.gestart_op,clock_timestamp()),p.klaar_op,p.geaccepteerde_run,p.pdf_pad,p.pdf_hash) ON CONFLICT(station_id) DO UPDATE SET status=EXCLUDED.status,fout=EXCLUDED.fout,bytes=EXCLUDED.bytes,paginas=EXCLUDED.paginas,fotos=EXCLUDED.fotos,gestart_op=EXCLUDED.gestart_op,klaar_op=EXCLUDED.klaar_op,geaccepteerde_run=EXCLUDED.geaccepteerde_run,pdf_pad=EXCLUDED.pdf_pad,pdf_hash=EXCLUDED.pdf_hash;
 END IF;
 IF _sync_patch IS NOT NULL THEN
 SELECT * INTO s FROM public.sharepoint_sync WHERE station_id=_station_id;
 s:=jsonb_populate_record(s,_sync_patch);
 INSERT INTO public.sharepoint_sync(station_id,status,aantal_bestanden,fout,sharepoint_url,gesynct_op,sharepoint_item_id,pdf_run,pdf_hash) VALUES(_station_id,s.status,coalesce(s.aantal_bestanden,0),s.fout,s.sharepoint_url,clock_timestamp(),s.sharepoint_item_id,s.pdf_run,s.pdf_hash) ON CONFLICT(station_id) DO UPDATE SET status=EXCLUDED.status,aantal_bestanden=EXCLUDED.aantal_bestanden,fout=EXCLUDED.fout,sharepoint_url=EXCLUDED.sharepoint_url,gesynct_op=EXCLUDED.gesynct_op,sharepoint_item_id=EXCLUDED.sharepoint_item_id,pdf_run=EXCLUDED.pdf_run,pdf_hash=EXCLUDED.pdf_hash;
 END IF;
 RETURN true;
END $$;
CREATE OR REPLACE FUNCTION public.dossier_snapshot(_station_id uuid) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object('station',to_jsonb(s),'fotos',coalesce((SELECT jsonb_agg(to_jsonb(f) ORDER BY f.categorie,f.volgorde,f.id) FROM public.fotos f WHERE f.station_id=s.id),'[]'::jsonb),'opmerkingen',coalesce((SELECT jsonb_agg(to_jsonb(o)) FROM public.categorie_opmerkingen o WHERE o.station_id=s.id),'[]'::jsonb),'skips',coalesce((SELECT jsonb_agg(to_jsonb(k)) FROM public.categorie_skips k WHERE k.station_id=s.id),'[]'::jsonb),'instellingen',coalesce((SELECT to_jsonb(i) FROM public.instellingen i LIMIT 1),'{}'::jsonb),'acties',coalesce((SELECT jsonb_agg(to_jsonb(a)) FROM public.to_acties a WHERE a.station_id=s.id AND a.afgehandeld_op IS NULL),'[]'::jsonb),'vereisten',coalesce((SELECT jsonb_agg(to_jsonb(c)) FROM public.vereiste_fotocategorieen(s) c),'[]'::jsonb)) FROM public.stations s WHERE s.id=_station_id
$$;
CREATE OR REPLACE FUNCTION public.verwerking_snapshot(_station_id uuid,_eigenaar uuid,_generatie bigint,_run uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d jsonb;
BEGIN
 IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'Alleen server' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.station_verwerking WHERE station_id=_station_id AND eigenaar=_eigenaar AND generatie=_generatie AND geldig_tot>clock_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Claim verlopen' USING ERRCODE='42501'; END IF;
 UPDATE public.opleverruns SET dossier=coalesce(dossier,public.dossier_snapshot(_station_id)) WHERE id=_run AND station_id=_station_id RETURNING dossier INTO d;
 IF d IS NULL THEN RAISE EXCEPTION 'Run ontbreekt' USING ERRCODE='22023'; END IF;
 RETURN d;
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
 UPDATE public.fotos SET review_status='pending',review_reden=NULL WHERE station_id=s.id AND review_status<>'approved';
 UPDATE public.opleverruns SET dossier=public.dossier_snapshot(s.id) WHERE id=rid;
 RETURN jsonb_build_object('id',rid,'nieuw',true);
END $$;
CREATE OR REPLACE FUNCTION public.uitvoerbare_opleverruns(_station_id uuid DEFAULT NULL,_limiet integer DEFAULT 20) RETURNS SETOF public.opleverruns LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 SELECT r.* FROM public.opleverruns r JOIN public.stations s ON s.id=r.station_id WHERE r.status NOT IN ('afgerond','mislukt') AND (_station_id IS NULL OR r.station_id=_station_id) AND (r.status<>'wacht_op_retry' OR r.volgende_poging_op IS NULL OR r.volgende_poging_op<=clock_timestamp()) AND (r.status<>'wacht_op_casegegevens' OR (btrim(coalesce(s.casenummer,''))<>'' AND btrim(coalesce(s.casenaam,''))<>'')) AND NOT EXISTS(SELECT 1 FROM public.station_verwerking c WHERE c.station_id=r.station_id AND c.eigenaar IS NOT NULL AND c.geldig_tot>clock_timestamp()) ORDER BY r.gestart_op,r.id LIMIT least(100,greatest(1,_limiet))
$$;
CREATE OR REPLACE FUNCTION public.case_aanmaken(_request_id uuid,_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.case_aanvragen; sid uuid; nr text; datum date;
BEGIN
 IF NOT public.heeft_beheer() THEN RAISE EXCEPTION 'Beheer ontgrendelen nodig' USING ERRCODE='42501'; END IF;
 IF _request_id IS NULL OR jsonb_typeof(_payload)<>'object' THEN RAISE EXCEPTION 'Ongeldige aanvraag' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('aanvraag:'||_request_id));
 SELECT * INTO a FROM public.case_aanvragen WHERE request_id=_request_id;
 IF FOUND THEN
 IF a.user_id IS DISTINCT FROM auth.uid() OR a.payload IS DISTINCT FROM _payload THEN RAISE EXCEPTION 'Aanvraagnummer hoort bij andere inhoud of gebruiker' USING ERRCODE='22023'; END IF;
 RETURN jsonb_build_object('id',a.station_id,'uitkomst','replay');
 END IF;
 IF length(coalesce(_payload->>'wv',''))>300 OR length(coalesce(_payload->>'notitie',''))>4000 OR length(coalesce(_payload->>'onHoldReden',''))>1000 THEN RAISE EXCEPTION 'Invoer te lang' USING ERRCODE='22023'; END IF;
 IF coalesce(_payload->>'ingediendOp','')<>'' THEN
 IF (_payload->>'ingediendOp')!~'^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'Ongeldige datum' USING ERRCODE='22023'; END IF;
 BEGIN datum:=(_payload->>'ingediendOp')::date; EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Ongeldige datum' USING ERRCODE='22023'; END;
 IF datum<'1990-01-01' OR datum>'2100-12-31' THEN RAISE EXCEPTION 'Ongeldige datum' USING ERRCODE='22023'; END IF;
 END IF;
 nr:=regexp_replace(btrim(coalesce(_payload->>'casenummer','')),'\s+',' ','g');
 PERFORM pg_advisory_xact_lock(hashtext('case:'||lower(nr)));
 IF EXISTS(SELECT 1 FROM public.stations WHERE lower(regexp_replace(btrim(casenummer),'\s+',' ','g'))=lower(nr)) THEN RETURN jsonb_build_object('uitkomst','bestaat'); END IF;
 sid:=public.maak_case(nr,_payload->>'casenaam',coalesce(_payload->>'uitvoerder','van_gelder')::public.case_uitvoerder,_payload->>'wv',_payload->>'notitie',coalesce((_payload->>'ronde')::integer,1),coalesce(_payload->>'toStatus','open'),datum,coalesce((_payload->>'onHold')::boolean,false),_payload->>'onHoldReden');
 INSERT INTO public.case_aanvragen(request_id,user_id,session_id,payload,station_id) VALUES(_request_id,auth.uid(),auth.jwt()->>'session_id',_payload,sid);
 RETURN jsonb_build_object('id',sid,'uitkomst','aangemaakt');
END $$;
REVOKE ALL ON FUNCTION public.station_claim(uuid,uuid,uuid,integer),public.station_claim_check(uuid,uuid,bigint,boolean),public.verwerking_opslaan(uuid,uuid,bigint,uuid,jsonb,jsonb,jsonb),public.dossier_snapshot(uuid),public.verwerking_snapshot(uuid,uuid,bigint,uuid),public.uitvoerbare_opleverruns(uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.station_claim(uuid,uuid,uuid,integer),public.station_claim_check(uuid,uuid,bigint,boolean),public.verwerking_opslaan(uuid,uuid,bigint,uuid,jsonb,jsonb,jsonb),public.dossier_snapshot(uuid),public.verwerking_snapshot(uuid,uuid,bigint,uuid),public.uitvoerbare_opleverruns(uuid,integer) TO service_role;
REVOKE ALL ON FUNCTION public.case_aanmaken(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.case_aanmaken(uuid,jsonb) TO authenticated,service_role;