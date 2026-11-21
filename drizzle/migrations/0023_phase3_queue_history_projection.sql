ALTER TABLE public.sharepoint_wachtrij ADD COLUMN aanvraag_id uuid NOT NULL DEFAULT gen_random_uuid();
REVOKE ALL ON public.sharepoint_wachtrij FROM anon,authenticated;
GRANT SELECT ON public.sharepoint_wachtrij TO anon,authenticated;
CREATE OR REPLACE FUNCTION public.sharepoint_uitstellen(_station_id uuid,_alleen_status boolean DEFAULT false,_fout text DEFAULT 'Station bezet') RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'Alleen server' USING ERRCODE='42501'; END IF;
 INSERT INTO public.sharepoint_wachtrij(station_id,alleen_status,volgende_poging_op,fout,poging) VALUES(_station_id,_alleen_status,clock_timestamp()+interval '1 minute',left(_fout,500),1) ON CONFLICT(station_id) DO UPDATE SET aanvraag_id=gen_random_uuid(),alleen_status=sharepoint_wachtrij.alleen_status AND EXCLUDED.alleen_status,volgende_poging_op=EXCLUDED.volgende_poging_op,fout=EXCLUDED.fout,poging=sharepoint_wachtrij.poging+1;
END $$;
CREATE OR REPLACE FUNCTION public.verwerking_wachtrij_klaar(_station_id uuid,_eigenaar uuid,_generatie bigint) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ SELECT false $$;
CREATE FUNCTION public.verwerking_wachtrij_snapshot(_station_id uuid,_eigenaar uuid,_generatie bigint) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE q jsonb; BEGIN
 IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'Alleen server' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.station_verwerking WHERE station_id=_station_id AND eigenaar=_eigenaar AND generatie=_generatie AND geldig_tot>clock_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Claim verlopen' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('aanvraag_id',aanvraag_id,'alleen_status',alleen_status) INTO q FROM public.sharepoint_wachtrij WHERE station_id=_station_id;
 RETURN q;
END $$;
CREATE FUNCTION public.verwerking_wachtrij_klaar(_station_id uuid,_eigenaar uuid,_generatie bigint,_aanvraag_id uuid,_alleen_status boolean) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'Alleen server' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.station_verwerking WHERE station_id=_station_id AND eigenaar=_eigenaar AND generatie=_generatie AND geldig_tot>clock_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 DELETE FROM public.sharepoint_wachtrij WHERE station_id=_station_id AND aanvraag_id=_aanvraag_id AND (NOT _alleen_status OR alleen_status);
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.verwerking_wachtrij_snapshot(uuid,uuid,bigint),public.verwerking_wachtrij_klaar(uuid,uuid,bigint,uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.verwerking_wachtrij_snapshot(uuid,uuid,bigint),public.verwerking_wachtrij_klaar(uuid,uuid,bigint,uuid,boolean) TO service_role;
DO $$ DECLARE d text; BEGIN
 d:=pg_get_functiondef('public.case_aanmaken(uuid,jsonb)'::regprocedure);
 IF strpos(d,'RETURN jsonb_build_object(''id'',a.station_id,''uitkomst'',''replay'');')=0 THEN RAISE EXCEPTION 'Unexpected case replay definition'; END IF;
 d:=replace(d,'RETURN jsonb_build_object(''id'',a.station_id,''uitkomst'',''replay'');','IF NOT EXISTS(SELECT 1 FROM public.stations WHERE id=a.station_id) THEN RETURN jsonb_build_object(''uitkomst'',''verwijderd''); END IF; RETURN jsonb_build_object(''id'',a.station_id,''uitkomst'',''replay'');'); EXECUTE d;
END $$;
CREATE OR REPLACE FUNCTION public.uitvoerbare_opleverruns(_station_id uuid DEFAULT NULL,_limiet integer DEFAULT 20) RETURNS SETOF public.opleverruns LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 SELECT r.* FROM public.opleverruns r LEFT JOIN public.stations s ON s.id=r.station_id WHERE r.status NOT IN ('afgerond','mislukt') AND (_station_id IS NULL OR r.station_id=_station_id) AND (s.id IS NULL OR ((r.status<>'wacht_op_retry' OR r.volgende_poging_op IS NULL OR r.volgende_poging_op<=clock_timestamp()) AND (r.status<>'wacht_op_casegegevens' OR (btrim(coalesce(s.casenummer,''))<>'' AND btrim(coalesce(s.casenaam,''))<>'')))) AND NOT EXISTS(SELECT 1 FROM public.station_verwerking c WHERE c.station_id=r.station_id AND c.eigenaar IS NOT NULL AND c.geldig_tot>clock_timestamp()) ORDER BY r.gestart_op,r.id LIMIT least(100,greatest(1,_limiet))
$$;
CREATE FUNCTION public.opleverrun_verweesd(_id uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE sid uuid; BEGIN
 IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'Alleen server' USING ERRCODE='42501'; END IF;
 SELECT station_id INTO sid FROM public.opleverruns WHERE id=_id; IF NOT FOUND THEN RETURN false; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('verwerking:'||sid));
 IF EXISTS(SELECT 1 FROM public.stations WHERE id=sid) OR EXISTS(SELECT 1 FROM public.station_verwerking WHERE station_id=sid AND eigenaar IS NOT NULL AND geldig_tot>clock_timestamp()) THEN RETURN false; END IF;
 UPDATE public.opleverruns SET status='mislukt',fout='Station inmiddels verwijderd',retry_stap=NULL,volgende_poging_op=NULL,afgerond_op=clock_timestamp() WHERE id=_id AND status NOT IN ('afgerond','mislukt'); RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.opleverrun_verweesd(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.opleverrun_verweesd(uuid) TO service_role;
ALTER TABLE public.stations ADD COLUMN dossier_notitie_versie bigint NOT NULL DEFAULT 0;
CREATE TABLE public.hold_periodes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),station_id uuid NOT NULL REFERENCES public.stations(id) ON DELETE CASCADE,begin_op date,einde_op date,reden text NOT NULL,partij public.on_hold_partij NOT NULL,verwacht_op date, CHECK(einde_op IS NULL OR begin_op IS NULL OR einde_op>=begin_op));
GRANT SELECT ON public.hold_periodes TO anon,authenticated;
GRANT ALL ON public.hold_periodes TO service_role;
ALTER TABLE public.hold_periodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY hold_read ON public.hold_periodes FOR SELECT TO anon,authenticated USING(true);
CREATE UNIQUE INDEX hold_een_actief ON public.hold_periodes(station_id) WHERE einde_op IS NULL;
INSERT INTO public.hold_periodes(station_id,begin_op,reden,partij,verwacht_op) SELECT id,on_hold_sinds,coalesce(on_hold_reden,''),coalesce(on_hold_partij,'terrevolt'),on_hold_tot FROM public.stations WHERE on_hold;
CREATE FUNCTION public.bewaak_case_versies() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
 IF TG_OP='UPDATE' AND current_user IN ('anon','authenticated') AND ((NEW.dossier_notitie,NEW.dossier_notitie_versie) IS DISTINCT FROM (OLD.dossier_notitie,OLD.dossier_notitie_versie) OR (NEW.on_hold,NEW.on_hold_reden,NEW.on_hold_sinds,NEW.on_hold_tot,NEW.on_hold_partij) IS DISTINCT FROM (OLD.on_hold,OLD.on_hold_reden,OLD.on_hold_sinds,OLD.on_hold_tot,OLD.on_hold_partij)) THEN RAISE EXCEPTION 'Gebruik de beveiligde notitie- of pauzeactie' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER case_versies_guard BEFORE UPDATE ON public.stations FOR EACH ROW EXECUTE FUNCTION public.bewaak_case_versies();
CREATE FUNCTION public.case_hold_insert() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF NEW.on_hold THEN
 UPDATE public.stations SET on_hold_sinds=(clock_timestamp() AT TIME ZONE 'Europe/Amsterdam')::date WHERE id=NEW.id;
 INSERT INTO public.hold_periodes(station_id,begin_op,reden,partij,verwacht_op) VALUES(NEW.id,(clock_timestamp() AT TIME ZONE 'Europe/Amsterdam')::date,coalesce(NEW.on_hold_reden,''),coalesce(NEW.on_hold_partij,'terrevolt'),NEW.on_hold_tot);
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER case_hold_new AFTER INSERT ON public.stations FOR EACH ROW EXECUTE FUNCTION public.case_hold_insert();
CREATE FUNCTION public.case_hold_start(_station_id uuid,_periode_id uuid,_reden text,_partij public.on_hold_partij,_verwacht date DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE h public.hold_periodes; BEGIN
 IF NOT public.heeft_beheer() THEN RAISE EXCEPTION 'Beheer ontgrendelen nodig' USING ERRCODE='42501'; END IF;
 IF _periode_id IS NULL OR length(btrim(coalesce(_reden,''))) NOT BETWEEN 1 AND 1000 OR _partij IS NULL THEN RAISE EXCEPTION 'Ongeldige pauze' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM public.stations WHERE id=_station_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Case inmiddels verwijderd' USING ERRCODE='22023'; END IF;
 SELECT * INTO h FROM public.hold_periodes WHERE id=_periode_id;
 IF FOUND THEN IF h.station_id<>_station_id OR h.reden<>btrim(_reden) OR h.partij<>_partij OR h.verwacht_op IS DISTINCT FROM _verwacht THEN RAISE EXCEPTION 'Andere pauzeaanvraag' USING ERRCODE='22023'; END IF; RETURN h.id; END IF;
 IF EXISTS(SELECT 1 FROM public.hold_periodes WHERE station_id=_station_id AND einde_op IS NULL) THEN RAISE EXCEPTION 'Case staat al on hold' USING ERRCODE='22023'; END IF;
 INSERT INTO public.hold_periodes(id,station_id,begin_op,reden,partij,verwacht_op) VALUES(_periode_id,_station_id,(clock_timestamp() AT TIME ZONE 'Europe/Amsterdam')::date,btrim(_reden),_partij,_verwacht);
 UPDATE public.stations SET on_hold=true,on_hold_reden=btrim(_reden),on_hold_partij=_partij,on_hold_sinds=(clock_timestamp() AT TIME ZONE 'Europe/Amsterdam')::date,on_hold_tot=_verwacht WHERE id=_station_id; RETURN _periode_id;
END $$;
CREATE FUNCTION public.case_hold_hervat(_station_id uuid,_periode_id uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE h public.hold_periodes; BEGIN
 IF NOT public.heeft_beheer() THEN RAISE EXCEPTION 'Beheer ontgrendelen nodig' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.stations WHERE id=_station_id FOR UPDATE; IF NOT FOUND THEN RETURN false; END IF;
 SELECT * INTO h FROM public.hold_periodes WHERE id=_periode_id AND station_id=_station_id FOR UPDATE; IF NOT FOUND THEN RETURN false; END IF;
 IF h.einde_op IS NOT NULL THEN RETURN true; END IF;
 UPDATE public.hold_periodes SET einde_op=(clock_timestamp() AT TIME ZONE 'Europe/Amsterdam')::date WHERE id=h.id;
 UPDATE public.stations SET on_hold=false,on_hold_reden=NULL,on_hold_partij=NULL,on_hold_sinds=NULL,on_hold_tot=NULL WHERE id=_station_id; RETURN true;
END $$;
CREATE FUNCTION public.case_notitie_opslaan(_station_id uuid,_versie bigint,_tekst text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE s public.stations; BEGIN
 IF NOT public.heeft_beheer() THEN RAISE EXCEPTION 'Beheer ontgrendelen nodig' USING ERRCODE='42501'; END IF;
 IF length(coalesce(_tekst,''))>4000 THEN RAISE EXCEPTION 'Notitie te lang' USING ERRCODE='22023'; END IF;
 SELECT * INTO s FROM public.stations WHERE id=_station_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Case inmiddels verwijderd' USING ERRCODE='22023'; END IF;
 IF s.dossier_notitie_versie<>_versie THEN RETURN jsonb_build_object('conflict',true,'versie',s.dossier_notitie_versie,'tekst',s.dossier_notitie); END IF;
 UPDATE public.stations SET dossier_notitie=nullif(_tekst,''),dossier_notitie_versie=dossier_notitie_versie+1 WHERE id=_station_id RETURNING * INTO s;
 RETURN jsonb_build_object('conflict',false,'versie',s.dossier_notitie_versie,'tekst',s.dossier_notitie);
END $$;
REVOKE ALL ON FUNCTION public.case_hold_start(uuid,uuid,text,public.on_hold_partij,date),public.case_hold_hervat(uuid,uuid),public.case_notitie_opslaan(uuid,bigint,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.case_hold_start(uuid,uuid,text,public.on_hold_partij,date),public.case_hold_hervat(uuid,uuid),public.case_notitie_opslaan(uuid,bigint,text) TO authenticated;
CREATE INDEX IF NOT EXISTS to_rondes_station_nummer ON public.to_rondes(station_id,nummer);
CREATE INDEX IF NOT EXISTS to_acties_ronde_open ON public.to_acties(ronde_id) WHERE afgehandeld_op IS NULL;
CREATE VIEW public.case_overzicht WITH(security_invoker=true) AS SELECT s.id,jsonb_build_object('id',s.id,'naam_msr',s.naam_msr,'casenummer',s.casenummer,'casenaam',s.casenaam,'behuizingsnummer',s.behuizingsnummer,'status',s.status,'dossier_status',s.dossier_status,'case_verborgen',s.case_verborgen,'created_at',s.created_at,'uitvoerder',s.uitvoerder,'wv',s.wv,'is_nummer',s.is_nummer,'tg',s.tg,'on_hold',s.on_hold,'on_hold_reden',s.on_hold_reden,'on_hold_sinds',s.on_hold_sinds,'on_hold_tot',s.on_hold_tot,'on_hold_partij',s.on_hold_partij,'hold_periodes',coalesce((SELECT jsonb_agg(jsonb_build_object('id',h.id,'begin_op',h.begin_op,'einde_op',h.einde_op)) FROM public.hold_periodes h WHERE h.station_id=s.id),'[]'::jsonb)) AS station,coalesce((SELECT jsonb_agg(jsonb_build_object('id',r.id,'station_id',r.station_id,'nummer',r.nummer,'status',r.status,'ingediend_op',r.ingediend_op,'ingediend_bij',r.ingediend_bij,'reactie_op',r.reactie_op,'redenen',r.redenen,'to_acties',CASE WHEN r.nummer=(SELECT max(x.nummer) FROM public.to_rondes x WHERE x.station_id=s.id) THEN coalesce((SELECT jsonb_agg(jsonb_build_object('id',a.id,'bij',a.bij,'derde_naam',a.derde_naam,'omschrijving',a.omschrijving,'created_at',a.created_at,'afgehandeld_op',a.afgehandeld_op) ORDER BY a.created_at,a.id) FROM public.to_acties a WHERE a.ronde_id=r.id AND a.afgehandeld_op IS NULL),'[]'::jsonb) ELSE '[]'::jsonb END) ORDER BY r.nummer,r.id) FROM public.to_rondes r WHERE r.station_id=s.id),'[]'::jsonb) AS rondes FROM public.stations s;
GRANT SELECT ON public.case_overzicht TO anon,authenticated,service_role;
CREATE FUNCTION public.case_wv_suggesties() RETURNS TABLE(wv text) LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$ SELECT DISTINCT btrim(s.wv) FROM public.stations s WHERE nullif(btrim(s.wv),'') IS NOT NULL ORDER BY 1 $$;
CREATE FUNCTION public.url_slug(_tekst text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public AS $$ SELECT btrim(regexp_replace(translate(lower(btrim(coalesce(_tekst,''))),'àáâãäåèéêëìíîïòóôõöùúûüñ','aaaaaaeeeeiiiiooooouuuun'),'[^a-z0-9]+','-','g'),'-') $$;
CREATE FUNCTION public.url_candidates(_key text DEFAULT NULL,_og text DEFAULT NULL) RETURNS TABLE(id uuid,uitvoerder public.case_uitvoerder,casenummer text,casenaam text,opdrachtgever text,behuizingsnummer text,naam_msr text,datum date,submitted_at timestamptz,created_at timestamptz) LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT s.id,s.uitvoerder,s.casenummer,s.casenaam,s.opdrachtgever,s.behuizingsnummer,s.naam_msr,s.datum,s.submitted_at,s.created_at FROM public.stations s WHERE (_key IS NOT NULL AND (s.id::text=lower(_key) OR (public.url_slug(s.casenummer)<>'' AND (public.url_slug(_key)=public.url_slug(s.casenummer) OR public.url_slug(_key) LIKE public.url_slug(s.casenummer)||'-%')) OR (nullif(regexp_replace(lower(btrim(s.behuizingsnummer)),'\s+','','g'),'') IS NOT NULL AND (lower(_key)=regexp_replace(lower(btrim(s.behuizingsnummer)),'\s+','','g') OR starts_with(lower(_key),regexp_replace(lower(btrim(s.behuizingsnummer)),'\s+','','g')||'-'))))) OR (_key IS NULL AND _og IS NOT NULL AND public.url_slug(coalesce(nullif(btrim(s.opdrachtgever),''),'van Gelder'))=public.url_slug(_og)) ORDER BY s.id
$$;
REVOKE ALL ON FUNCTION public.case_wv_suggesties(),public.url_candidates(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.case_wv_suggesties(),public.url_candidates(text,text) TO anon,authenticated,service_role;