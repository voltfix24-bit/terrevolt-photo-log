ALTER TABLE public.to_rondes ADD COLUMN IF NOT EXISTS open_redenen text[] NOT NULL DEFAULT '{}';

CREATE TABLE public.to_reden_opties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  soort text NOT NULL CHECK (soort IN ('open','afgekeurd')),
  label text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 80),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX to_reden_opties_uniek ON public.to_reden_opties (soort, lower(btrim(label)));
GRANT SELECT ON public.to_reden_opties TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.to_reden_opties TO authenticated;
GRANT ALL ON public.to_reden_opties TO service_role;
ALTER TABLE public.to_reden_opties ENABLE ROW LEVEL SECURITY;
CREATE POLICY reden_opties_lezen ON public.to_reden_opties FOR SELECT USING (true);
CREATE POLICY reden_opties_beheer ON public.to_reden_opties FOR ALL TO authenticated USING (public.heeft_beheer()) WITH CHECK (public.heeft_beheer());

CREATE OR REPLACE VIEW public.case_overzicht WITH(security_invoker=true) AS SELECT s.id,jsonb_build_object('id',s.id,'naam_msr',s.naam_msr,'casenummer',s.casenummer,'casenaam',s.casenaam,'behuizingsnummer',s.behuizingsnummer,'status',s.status,'dossier_status',s.dossier_status,'case_verborgen',s.case_verborgen,'created_at',s.created_at,'uitvoerder',s.uitvoerder,'wv',s.wv,'is_nummer',s.is_nummer,'tg',s.tg,'on_hold',s.on_hold,'on_hold_reden',s.on_hold_reden,'on_hold_sinds',s.on_hold_sinds,'on_hold_tot',s.on_hold_tot,'on_hold_partij',s.on_hold_partij,'hold_periodes',coalesce((SELECT jsonb_agg(jsonb_build_object('id',h.id,'begin_op',h.begin_op,'einde_op',h.einde_op)) FROM public.hold_periodes h WHERE h.station_id=s.id),'[]'::jsonb)) AS station,coalesce((SELECT jsonb_agg(jsonb_build_object('id',r.id,'station_id',r.station_id,'nummer',r.nummer,'status',r.status,'ingediend_op',r.ingediend_op,'ingediend_bij',r.ingediend_bij,'reactie_op',r.reactie_op,'redenen',r.redenen,'open_redenen',r.open_redenen,'to_acties',CASE WHEN r.nummer=(SELECT max(x.nummer) FROM public.to_rondes x WHERE x.station_id=s.id) THEN coalesce((SELECT jsonb_agg(jsonb_build_object('id',a.id,'bij',a.bij,'derde_naam',a.derde_naam,'omschrijving',a.omschrijving,'created_at',a.created_at,'afgehandeld_op',a.afgehandeld_op) ORDER BY a.created_at,a.id) FROM public.to_acties a WHERE a.ronde_id=r.id AND a.afgehandeld_op IS NULL),'[]'::jsonb) ELSE '[]'::jsonb END) ORDER BY r.nummer,r.id) FROM public.to_rondes r WHERE r.station_id=s.id),'[]'::jsonb) AS rondes FROM public.stations s;
GRANT SELECT ON public.case_overzicht TO anon,authenticated,service_role;