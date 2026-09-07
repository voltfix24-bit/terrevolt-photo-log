GRANT SELECT, INSERT, UPDATE, DELETE ON public.stations TO anon, authenticated;
GRANT ALL ON public.stations TO service_role;
ALTER TABLE public.stations ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fotos TO anon, authenticated;
GRANT ALL ON public.fotos TO service_role;
ALTER TABLE public.fotos ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.instellingen TO anon, authenticated;
GRANT ALL ON public.instellingen TO service_role;
ALTER TABLE public.instellingen ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Instellingen zijn publiek leesbaar" ON public.instellingen FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Instellingen zijn publiek toe te voegen" ON public.instellingen FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Instellingen zijn publiek aanpasbaar" ON public.instellingen FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Instellingen zijn publiek te verwijderen" ON public.instellingen FOR DELETE TO anon, authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.monteurs TO anon, authenticated;
GRANT ALL ON public.monteurs TO service_role;
ALTER TABLE public.monteurs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Monteurs zijn publiek leesbaar" ON public.monteurs FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Monteurs zijn publiek toe te voegen" ON public.monteurs FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Monteurs zijn publiek aanpasbaar" ON public.monteurs FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Monteurs zijn publiek te verwijderen" ON public.monteurs FOR DELETE TO anon, authenticated USING (true);