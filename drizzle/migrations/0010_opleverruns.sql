CREATE TABLE public.opleverruns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'aangevraagd',
  retry_stap text,
  poging integer NOT NULL DEFAULT 0,
  volgende_poging_op timestamptz,
  lease_id uuid,
  lease_tot timestamptz,
  pdf_run text,
  fout text,
  stap_fouten jsonb NOT NULL DEFAULT '{}'::jsonb,
  aangevraagd_door text,
  gestart_op timestamptz NOT NULL DEFAULT now(),
  bijgewerkt_op timestamptz NOT NULL DEFAULT now(),
  afgerond_op timestamptz
);
GRANT SELECT ON public.opleverruns TO anon, authenticated;
GRANT ALL ON public.opleverruns TO service_role;
ALTER TABLE public.opleverruns ENABLE ROW LEVEL SECURITY;
CREATE POLICY opleverruns_read ON public.opleverruns FOR SELECT TO anon, authenticated USING (true);
CREATE UNIQUE INDEX opleverruns_een_actief ON public.opleverruns (station_id) WHERE status NOT IN ('afgerond','mislukt');
CREATE INDEX opleverruns_station ON public.opleverruns (station_id, gestart_op DESC);

CREATE OR REPLACE FUNCTION public.opleverruns_check() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status NOT IN ('aangevraagd','voorbereiden','pdf_bezig','pdf_klaar','sharepoint_bezig','wacht_op_retry','wacht_op_casegegevens','afgerond','mislukt') THEN
    RAISE EXCEPTION 'ongeldige status %', NEW.status;
  END IF;
  NEW.bijgewerkt_op = now();
  RETURN NEW;
END $$;
CREATE TRIGGER opleverruns_check BEFORE INSERT OR UPDATE ON public.opleverruns FOR EACH ROW EXECUTE FUNCTION public.opleverruns_check();

-- Lease: alleen claimen als er geen geldige lease is (crash => lease verloopt => herstelbaar)
CREATE OR REPLACE FUNCTION public.opleverrun_claim(_id uuid, _seconden integer) RETURNS uuid
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.opleverruns SET lease_id = gen_random_uuid(), lease_tot = now() + make_interval(secs => _seconden)
  WHERE id = _id AND status NOT IN ('afgerond','mislukt') AND (lease_tot IS NULL OR lease_tot < now())
  RETURNING lease_id
$$;
REVOKE ALL ON FUNCTION public.opleverrun_claim(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.opleverrun_claim(uuid, integer) TO service_role;