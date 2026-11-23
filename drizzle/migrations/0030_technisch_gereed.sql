ALTER TABLE public.stations ADD COLUMN technisch_gereed boolean;
COMMENT ON COLUMN public.stations.technisch_gereed IS 'NULL = nog niet beantwoord; TO mag pas ingediend worden bij true';
CREATE OR REPLACE VIEW public.case_overzicht AS SELECT id,
    jsonb_build_object('id', id, 'naam_msr', naam_msr, 'casenummer', casenummer, 'casenaam', casenaam, 'behuizingsnummer', behuizingsnummer, 'status', status, 'dossier_status', dossier_status, 'case_verborgen', case_verborgen, 'created_at', created_at, 'uitvoerder', uitvoerder, 'wv', wv, 'is_nummer', is_nummer, 'tg', tg, 'on_hold', on_hold, 'on_hold_reden', on_hold_reden, 'on_hold_sinds', on_hold_sinds, 'on_hold_tot', on_hold_tot, 'on_hold_partij', on_hold_partij, 'hold_periodes', COALESCE(( SELECT jsonb_agg(jsonb_build_object('id', h.id, 'begin_op', h.begin_op, 'einde_op', h.einde_op))
           FROM hold_periodes h WHERE (h.station_id = s.id)), '[]'::jsonb)) || jsonb_build_object('technisch_gereed', technisch_gereed) AS station,
    COALESCE(( SELECT jsonb_agg(jsonb_build_object('id', r.id, 'station_id', r.station_id, 'nummer', r.nummer, 'status', r.status, 'ingediend_op', r.ingediend_op, 'ingediend_bij', r.ingediend_bij, 'reactie_op', r.reactie_op, 'redenen', r.redenen, 'open_redenen', r.open_redenen, 'to_acties',
                CASE WHEN (r.nummer = ( SELECT max(x.nummer) FROM to_rondes x WHERE (x.station_id = s.id))) THEN COALESCE(( SELECT jsonb_agg(jsonb_build_object('id', a.id, 'bij', a.bij, 'derde_naam', a.derde_naam, 'omschrijving', a.omschrijving, 'created_at', a.created_at, 'afgehandeld_op', a.afgehandeld_op) ORDER BY a.created_at, a.id)
                       FROM to_acties a WHERE ((a.ronde_id = r.id) AND (a.afgehandeld_op IS NULL))), '[]'::jsonb)
                    ELSE '[]'::jsonb END) ORDER BY r.nummer, r.id)
           FROM to_rondes r WHERE (r.station_id = s.id)), '[]'::jsonb) AS rondes
   FROM stations s;