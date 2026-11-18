CREATE TABLE public.rapport_pdf (
  station_id uuid PRIMARY KEY,
  status text NOT NULL DEFAULT 'bezig',
  fout text,
  bytes bigint,
  paginas integer,
  fotos integer,
  gestart_op timestamptz NOT NULL DEFAULT now(),
  klaar_op timestamptz
);
GRANT SELECT ON public.rapport_pdf TO anon, authenticated;
GRANT ALL ON public.rapport_pdf TO service_role;
ALTER TABLE public.rapport_pdf ENABLE ROW LEVEL SECURITY;
CREATE POLICY rapport_pdf_public_read ON public.rapport_pdf FOR SELECT TO anon, authenticated USING (true);