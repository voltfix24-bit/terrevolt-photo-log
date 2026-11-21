CREATE OR REPLACE FUNCTION public.station_claim(_station_id uuid,_eigenaar uuid,_run uuid DEFAULT NULL,_seconden integer DEFAULT 90) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE g bigint;
BEGIN
 IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'Alleen server' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('verwerking:'||_station_id));
 IF _run IS NOT NULL AND _run IS DISTINCT FROM (SELECT id FROM public.opleverruns WHERE station_id=_station_id ORDER BY gestart_op DESC,id DESC LIMIT 1) THEN RETURN NULL; END IF;
 IF EXISTS(SELECT 1 FROM public.opleverruns WHERE station_id=_station_id AND status NOT IN ('afgerond','mislukt') AND id IS DISTINCT FROM _run) THEN RETURN NULL; END IF;
 INSERT INTO public.station_verwerking(station_id) VALUES(_station_id) ON CONFLICT DO NOTHING;
 UPDATE public.station_verwerking SET eigenaar=_eigenaar,generatie=generatie+1,geldig_tot=clock_timestamp()+make_interval(secs=>least(300,greatest(10,_seconden))) WHERE station_id=_station_id AND (eigenaar IS NULL OR geldig_tot<=clock_timestamp()) RETURNING generatie INTO g;
 RETURN g;
END $$;
CREATE OR REPLACE FUNCTION public.verwerking_wachtrij_klaar(_station_id uuid,_eigenaar uuid,_generatie bigint) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'Alleen server' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.station_verwerking WHERE station_id=_station_id AND eigenaar=_eigenaar AND generatie=_generatie AND geldig_tot>clock_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 DELETE FROM public.sharepoint_wachtrij WHERE station_id=_station_id;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.verwerking_wachtrij_klaar(uuid,uuid,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.verwerking_wachtrij_klaar(uuid,uuid,bigint) TO service_role;