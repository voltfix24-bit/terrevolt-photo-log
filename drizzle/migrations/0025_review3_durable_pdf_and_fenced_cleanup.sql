ALTER TABLE public.opleverruns ADD COLUMN pdf_stap integer NOT NULL DEFAULT 0 CHECK(pdf_stap>=0), ADD COLUMN pdf_poging_op timestamptz, ADD COLUMN pdf_voortgang_op timestamptz, ADD COLUMN pdf_volgende_op timestamptz;
REVOKE ALL ON public.hold_periodes FROM anon,authenticated;
GRANT SELECT ON public.hold_periodes TO anon,authenticated;
CREATE INDEX hold_historie_station ON public.hold_periodes(station_id,begin_op,id);
CREATE OR REPLACE FUNCTION public.case_notitie_opslaan(_station_id uuid,_versie bigint,_tekst text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE s public.stations; BEGIN
 IF NOT public.heeft_beheer() THEN RAISE EXCEPTION 'Beheer ontgrendelen nodig' USING ERRCODE='42501'; END IF;
 IF length(coalesce(_tekst,''))>4000 THEN RAISE EXCEPTION 'Notitie te lang' USING ERRCODE='22023'; END IF;
 SELECT * INTO s FROM public.stations WHERE id=_station_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Case inmiddels verwijderd' USING ERRCODE='22023'; END IF;
 IF s.dossier_notitie_versie IS DISTINCT FROM _versie THEN RETURN jsonb_build_object('conflict',true,'versie',s.dossier_notitie_versie,'tekst',s.dossier_notitie); END IF;
 UPDATE public.stations SET dossier_notitie=nullif(_tekst,''),dossier_notitie_versie=dossier_notitie_versie+1 WHERE id=_station_id RETURNING * INTO s;
 RETURN jsonb_build_object('conflict',false,'versie',s.dossier_notitie_versie,'tekst',s.dossier_notitie);
END $$;
CREATE OR REPLACE FUNCTION public.bewaak_case_versies() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
 IF TG_OP='INSERT' THEN NEW.dossier_notitie_versie:=0; RETURN NEW; END IF;
 IF current_user IN ('anon','authenticated') AND ((NEW.dossier_notitie,NEW.dossier_notitie_versie) IS DISTINCT FROM (OLD.dossier_notitie,OLD.dossier_notitie_versie) OR (NEW.on_hold,NEW.on_hold_reden,NEW.on_hold_sinds,NEW.on_hold_tot,NEW.on_hold_partij) IS DISTINCT FROM (OLD.on_hold,OLD.on_hold_reden,OLD.on_hold_sinds,OLD.on_hold_tot,OLD.on_hold_partij)) THEN RAISE EXCEPTION 'Gebruik de beveiligde notitie- of pauzeactie' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER case_versies_insert_guard BEFORE INSERT ON public.stations FOR EACH ROW EXECUTE FUNCTION public.bewaak_case_versies();
CREATE FUNCTION public.verwerking_sync_verwijderen(_station_id uuid,_eigenaar uuid,_generatie bigint,_item_id text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Alleen server' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.station_verwerking WHERE station_id=_station_id AND eigenaar=_eigenaar AND generatie=_generatie AND geldig_tot>clock_timestamp() FOR UPDATE;
 IF NOT FOUND OR EXISTS(SELECT 1 FROM public.stations WHERE id=_station_id) THEN RETURN false; END IF;
 DELETE FROM public.sharepoint_sync WHERE station_id=_station_id AND sharepoint_item_id IS NOT DISTINCT FROM _item_id;
 RETURN FOUND;
END $$;
DO $$ DECLARE d text; BEGIN
 d:=pg_get_functiondef('public.verwerking_opslaan(uuid,uuid,bigint,uuid,jsonb,jsonb,jsonb)'::regprocedure);
 IF strpos(d,'IF _run_patch IS NOT NULL THEN')=0 THEN RAISE EXCEPTION 'Unexpected processing definition'; END IF;
 d:=replace(d,'IF _run_patch IS NOT NULL THEN','IF r.status IN (''afgerond'',''mislukt'') THEN RETURN false; END IF; IF _run_patch IS NOT NULL THEN'); EXECUTE d;
END $$;
CREATE FUNCTION public.verwerking_run_cas(_station_id uuid,_eigenaar uuid,_generatie bigint,_run uuid,_verwacht jsonb,_patch jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE r public.opleverruns; BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Alleen server' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.station_verwerking WHERE station_id=_station_id AND eigenaar=_eigenaar AND generatie=_generatie AND geldig_tot>clock_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT * INTO r FROM public.opleverruns WHERE id=_run AND station_id=_station_id FOR UPDATE;
 IF NOT FOUND OR r.status IN ('afgerond','mislukt') OR _verwacht IS NULL OR NOT(to_jsonb(r) @> _verwacht) THEN RETURN false; END IF;
 RETURN public.verwerking_opslaan(_station_id,_eigenaar,_generatie,_run,_patch,NULL,NULL);
END $$;
CREATE FUNCTION public.pdf_stap_start(_station_id uuid,_eigenaar uuid,_generatie bigint,_run uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE r public.opleverruns; BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Alleen server' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.station_verwerking WHERE station_id=_station_id AND eigenaar=_eigenaar AND generatie=_generatie AND geldig_tot>clock_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO r FROM public.opleverruns WHERE id=_run AND station_id=_station_id FOR UPDATE;
 IF NOT FOUND OR r.status<>'pdf_bezig' OR r.pdf_pad IS NOT NULL THEN RETURN NULL; END IF;
 UPDATE public.opleverruns SET pdf_poging_op=coalesce(pdf_poging_op,clock_timestamp()),pdf_voortgang_op=clock_timestamp(),pdf_volgende_op=clock_timestamp()+interval '2 minutes' WHERE id=_run RETURNING * INTO r;
 UPDATE public.opleverruns SET pdf_run=r.pdf_poging_op::text WHERE id=_run RETURNING * INTO r;
 RETURN to_jsonb(r);
END $$;
CREATE FUNCTION public.pdf_stap_klaar(_station_id uuid,_eigenaar uuid,_generatie bigint,_run uuid,_stap integer) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Alleen server' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.station_verwerking WHERE station_id=_station_id AND eigenaar=_eigenaar AND generatie=_generatie AND geldig_tot>clock_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 UPDATE public.opleverruns SET pdf_stap=pdf_stap+1,pdf_voortgang_op=clock_timestamp(),pdf_volgende_op=clock_timestamp() WHERE id=_run AND station_id=_station_id AND status='pdf_bezig' AND pdf_pad IS NULL AND pdf_stap=_stap;
 RETURN FOUND;
END $$;
DO $$ DECLARE d text; BEGIN
 d:=pg_get_functiondef('public.opleverrun_retry(uuid)'::regprocedure);
 d:=replace(d,'poging=0,volgende_poging_op=NULL','pdf_poging_op=NULL,pdf_voortgang_op=NULL,pdf_volgende_op=NULL,poging=0,volgende_poging_op=NULL'); EXECUTE d;
END $$;
CREATE OR REPLACE FUNCTION public.uitvoerbare_opleverruns(_station_id uuid DEFAULT NULL,_limiet integer DEFAULT 20) RETURNS SETOF public.opleverruns LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 SELECT r.* FROM public.opleverruns r LEFT JOIN public.stations s ON s.id=r.station_id LEFT JOIN public.rapport_pdf p ON p.station_id=r.station_id WHERE r.status NOT IN ('afgerond','mislukt') AND (_station_id IS NULL OR r.station_id=_station_id) AND (s.id IS NULL OR ((r.status<>'wacht_op_retry' OR r.volgende_poging_op IS NULL OR r.volgende_poging_op<=clock_timestamp()) AND (r.status<>'wacht_op_casegegevens' OR (btrim(coalesce(s.casenummer,''))<>'' AND btrim(coalesce(s.casenaam,''))<>'')) AND (r.status<>'pdf_bezig' OR r.pdf_pad IS NOT NULL OR (p.status='mislukt' AND p.gestart_op=r.pdf_poging_op) OR coalesce(r.pdf_volgende_op,r.pdf_voortgang_op+interval '2 minutes',r.gestart_op+interval '2 minutes')<=clock_timestamp()))) AND NOT EXISTS(SELECT 1 FROM public.station_verwerking c WHERE c.station_id=r.station_id AND c.eigenaar IS NOT NULL AND c.geldig_tot>clock_timestamp()) ORDER BY r.gestart_op,r.id LIMIT least(100,greatest(1,_limiet))
$$;
REVOKE ALL ON FUNCTION public.verwerking_sync_verwijderen(uuid,uuid,bigint,text),public.verwerking_run_cas(uuid,uuid,bigint,uuid,jsonb,jsonb),public.pdf_stap_start(uuid,uuid,bigint,uuid),public.pdf_stap_klaar(uuid,uuid,bigint,uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.verwerking_sync_verwijderen(uuid,uuid,bigint,text),public.verwerking_run_cas(uuid,uuid,bigint,uuid,jsonb,jsonb),public.pdf_stap_start(uuid,uuid,bigint,uuid),public.pdf_stap_klaar(uuid,uuid,bigint,uuid,integer) TO service_role;