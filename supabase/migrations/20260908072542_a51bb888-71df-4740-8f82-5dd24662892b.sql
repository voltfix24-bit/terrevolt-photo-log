
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['stations','fotos','categorie_skips','categorie_opmerkingen','categorie_instellingen','categorie_voorbeelden','monteurs','opdrachtgevers','instellingen']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_anon_write', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO anon USING (true) WITH CHECK (true)', t||'_anon_write', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO anon', t);
  END LOOP;
END $$;
