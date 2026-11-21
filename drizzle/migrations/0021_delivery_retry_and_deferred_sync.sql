CREATE OR REPLACE FUNCTION public.opleverrun_retry(_id uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.opleverruns;
BEGIN
 IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'Alleen server' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM public.opleverruns WHERE id=_id;
 IF NOT FOUND THEN RETURN false; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('verwerking:'||r.station_id));
 IF EXISTS(SELECT 1 FROM public.station_verwerking WHERE station_id=r.station_id AND eigenaar IS NOT NULL AND geldig_tot>clock_timestamp()) OR EXISTS(SELECT 1 FROM public.opleverruns WHERE station_id=r.station_id AND id<>_id AND status NOT IN ('afgerond','mislukt')) THEN RETURN false; END IF;
 UPDATE public.opleverruns SET status=CASE WHEN retry_stap='sharepoint' OR status='wacht_op_casegegevens' OR pdf_pad IS NOT NULL THEN 'pdf_klaar' ELSE 'aangevraagd' END,poging=0,volgende_poging_op=NULL,afgerond_op=NULL WHERE id=_id AND status IN ('mislukt','wacht_op_retry','wacht_op_casegegevens');
 RETURN FOUND;
END $$;
CREATE OR REPLACE FUNCTION public.sharepoint_uitstellen(_station_id uuid,_alleen_status boolean DEFAULT false,_fout text DEFAULT 'Station bezet') RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'Alleen server' USING ERRCODE='42501'; END IF;
 INSERT INTO public.sharepoint_wachtrij(station_id,alleen_status,volgende_poging_op,fout,poging) VALUES(_station_id,_alleen_status,clock_timestamp()+interval '1 minute',left(_fout,500),1) ON CONFLICT(station_id) DO UPDATE SET alleen_status=sharepoint_wachtrij.alleen_status AND EXCLUDED.alleen_status,volgende_poging_op=EXCLUDED.volgende_poging_op,fout=EXCLUDED.fout,poging=sharepoint_wachtrij.poging+1;
END $$;
REVOKE ALL ON FUNCTION public.opleverrun_retry(uuid),public.sharepoint_uitstellen(uuid,boolean,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.opleverrun_retry(uuid),public.sharepoint_uitstellen(uuid,boolean,text) TO service_role;