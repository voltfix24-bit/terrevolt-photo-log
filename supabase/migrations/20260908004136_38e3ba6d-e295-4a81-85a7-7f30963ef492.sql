-- categorie_instellingen
DROP POLICY IF EXISTS "Anyone can delete categorie_instellingen" ON public.categorie_instellingen;
DROP POLICY IF EXISTS "Anyone can insert categorie_instellingen" ON public.categorie_instellingen;
DROP POLICY IF EXISTS "Anyone can update categorie_instellingen" ON public.categorie_instellingen;
DROP POLICY IF EXISTS "Anyone can view categorie_instellingen" ON public.categorie_instellingen;
CREATE POLICY "ci_public_read" ON public.categorie_instellingen FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "ci_auth_insert" ON public.categorie_instellingen FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "ci_auth_update" ON public.categorie_instellingen FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "ci_auth_delete" ON public.categorie_instellingen FOR DELETE TO authenticated USING (true);
REVOKE ALL ON public.categorie_instellingen FROM anon;
GRANT SELECT ON public.categorie_instellingen TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categorie_instellingen TO authenticated;
GRANT ALL ON public.categorie_instellingen TO service_role;

-- categorie_opmerkingen
DROP POLICY IF EXISTS "Anyone can delete categorie_opmerkingen" ON public.categorie_opmerkingen;
DROP POLICY IF EXISTS "Anyone can insert categorie_opmerkingen" ON public.categorie_opmerkingen;
DROP POLICY IF EXISTS "Anyone can update categorie_opmerkingen" ON public.categorie_opmerkingen;
DROP POLICY IF EXISTS "Anyone can view categorie_opmerkingen" ON public.categorie_opmerkingen;
CREATE POLICY "co_public_read" ON public.categorie_opmerkingen FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "co_auth_insert" ON public.categorie_opmerkingen FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "co_auth_update" ON public.categorie_opmerkingen FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "co_auth_delete" ON public.categorie_opmerkingen FOR DELETE TO authenticated USING (true);
REVOKE ALL ON public.categorie_opmerkingen FROM anon;
GRANT SELECT ON public.categorie_opmerkingen TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categorie_opmerkingen TO authenticated;
GRANT ALL ON public.categorie_opmerkingen TO service_role;

-- categorie_skips
DROP POLICY IF EXISTS "Categorie skips zijn publiek aanpasbaar" ON public.categorie_skips;
DROP POLICY IF EXISTS "Categorie skips zijn publiek leesbaar" ON public.categorie_skips;
DROP POLICY IF EXISTS "Categorie skips zijn publiek te verwijderen" ON public.categorie_skips;
DROP POLICY IF EXISTS "Categorie skips zijn publiek toe te voegen" ON public.categorie_skips;
CREATE POLICY "cs_public_read" ON public.categorie_skips FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "cs_auth_insert" ON public.categorie_skips FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "cs_auth_update" ON public.categorie_skips FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "cs_auth_delete" ON public.categorie_skips FOR DELETE TO authenticated USING (true);
REVOKE ALL ON public.categorie_skips FROM anon;
GRANT SELECT ON public.categorie_skips TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categorie_skips TO authenticated;
GRANT ALL ON public.categorie_skips TO service_role;

-- categorie_voorbeelden
DROP POLICY IF EXISTS "Allow public delete on categorie_voorbeelden" ON public.categorie_voorbeelden;
DROP POLICY IF EXISTS "Allow public insert on categorie_voorbeelden" ON public.categorie_voorbeelden;
DROP POLICY IF EXISTS "Allow public read on categorie_voorbeelden" ON public.categorie_voorbeelden;
CREATE POLICY "cv_public_read" ON public.categorie_voorbeelden FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "cv_auth_insert" ON public.categorie_voorbeelden FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "cv_auth_update" ON public.categorie_voorbeelden FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "cv_auth_delete" ON public.categorie_voorbeelden FOR DELETE TO authenticated USING (true);
REVOKE ALL ON public.categorie_voorbeelden FROM anon;
GRANT SELECT ON public.categorie_voorbeelden TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categorie_voorbeelden TO authenticated;
GRANT ALL ON public.categorie_voorbeelden TO service_role;

-- fotos
DROP POLICY IF EXISTS "Anyone can create fotos" ON public.fotos;
DROP POLICY IF EXISTS "Anyone can delete fotos" ON public.fotos;
DROP POLICY IF EXISTS "Anyone can update fotos" ON public.fotos;
DROP POLICY IF EXISTS "Anyone can view fotos" ON public.fotos;
CREATE POLICY "fotos_public_read" ON public.fotos FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "fotos_auth_insert" ON public.fotos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "fotos_auth_update" ON public.fotos FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "fotos_auth_delete" ON public.fotos FOR DELETE TO authenticated USING (true);
REVOKE ALL ON public.fotos FROM anon;
GRANT SELECT ON public.fotos TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fotos TO authenticated;
GRANT ALL ON public.fotos TO service_role;

-- instellingen
DROP POLICY IF EXISTS "Instellingen zijn publiek aanpasbaar" ON public.instellingen;
DROP POLICY IF EXISTS "Instellingen zijn publiek leesbaar" ON public.instellingen;
DROP POLICY IF EXISTS "Instellingen zijn publiek te verwijderen" ON public.instellingen;
DROP POLICY IF EXISTS "Instellingen zijn publiek toe te voegen" ON public.instellingen;
CREATE POLICY "inst_public_read" ON public.instellingen FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "inst_auth_insert" ON public.instellingen FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "inst_auth_update" ON public.instellingen FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "inst_auth_delete" ON public.instellingen FOR DELETE TO authenticated USING (true);
REVOKE ALL ON public.instellingen FROM anon;
GRANT SELECT ON public.instellingen TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.instellingen TO authenticated;
GRANT ALL ON public.instellingen TO service_role;

-- monteurs
DROP POLICY IF EXISTS "Monteurs zijn publiek aanpasbaar" ON public.monteurs;
DROP POLICY IF EXISTS "Monteurs zijn publiek leesbaar" ON public.monteurs;
DROP POLICY IF EXISTS "Monteurs zijn publiek te verwijderen" ON public.monteurs;
DROP POLICY IF EXISTS "Monteurs zijn publiek toe te voegen" ON public.monteurs;
CREATE POLICY "mont_public_read" ON public.monteurs FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "mont_auth_insert" ON public.monteurs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "mont_auth_update" ON public.monteurs FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "mont_auth_delete" ON public.monteurs FOR DELETE TO authenticated USING (true);
REVOKE ALL ON public.monteurs FROM anon;
GRANT SELECT ON public.monteurs TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.monteurs TO authenticated;
GRANT ALL ON public.monteurs TO service_role;

-- opdrachtgevers
DROP POLICY IF EXISTS "Opdrachtgevers zijn publiek aanpasbaar" ON public.opdrachtgevers;
DROP POLICY IF EXISTS "Opdrachtgevers zijn publiek leesbaar" ON public.opdrachtgevers;
DROP POLICY IF EXISTS "Opdrachtgevers zijn publiek te verwijderen" ON public.opdrachtgevers;
DROP POLICY IF EXISTS "Opdrachtgevers zijn publiek toe te voegen" ON public.opdrachtgevers;
CREATE POLICY "opd_public_read" ON public.opdrachtgevers FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "opd_auth_insert" ON public.opdrachtgevers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "opd_auth_update" ON public.opdrachtgevers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "opd_auth_delete" ON public.opdrachtgevers FOR DELETE TO authenticated USING (true);
REVOKE ALL ON public.opdrachtgevers FROM anon;
GRANT SELECT ON public.opdrachtgevers TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.opdrachtgevers TO authenticated;
GRANT ALL ON public.opdrachtgevers TO service_role;

-- push_subscriptions (bevat persoonlijke endpoints: geen publieke toegang)
DROP POLICY IF EXISTS "Anyone can delete push_subscriptions" ON public.push_subscriptions;
DROP POLICY IF EXISTS "Anyone can insert push_subscriptions" ON public.push_subscriptions;
DROP POLICY IF EXISTS "Anyone can update push_subscriptions" ON public.push_subscriptions;
DROP POLICY IF EXISTS "Anyone can view push_subscriptions" ON public.push_subscriptions;
CREATE POLICY "push_auth_read" ON public.push_subscriptions FOR SELECT TO authenticated USING (true);
CREATE POLICY "push_auth_insert" ON public.push_subscriptions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "push_auth_update" ON public.push_subscriptions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "push_auth_delete" ON public.push_subscriptions FOR DELETE TO authenticated USING (true);
REVOKE ALL ON public.push_subscriptions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;

-- stations
DROP POLICY IF EXISTS "Anyone can create stations" ON public.stations;
DROP POLICY IF EXISTS "Anyone can delete stations" ON public.stations;
DROP POLICY IF EXISTS "Anyone can update stations" ON public.stations;
DROP POLICY IF EXISTS "Anyone can view stations" ON public.stations;
CREATE POLICY "stations_public_read" ON public.stations FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "stations_auth_insert" ON public.stations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "stations_auth_update" ON public.stations FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "stations_auth_delete" ON public.stations FOR DELETE TO authenticated USING (true);
REVOKE ALL ON public.stations FROM anon;
GRANT SELECT ON public.stations TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stations TO authenticated;
GRANT ALL ON public.stations TO service_role;

-- Opslag: branding en to-fotos blijven leesbaar, schrijven alleen ingelogd
DROP POLICY IF EXISTS "branding_public_read" ON storage.objects;
DROP POLICY IF EXISTS "branding_auth_insert" ON storage.objects;
DROP POLICY IF EXISTS "branding_auth_update" ON storage.objects;
DROP POLICY IF EXISTS "branding_auth_delete" ON storage.objects;
DROP POLICY IF EXISTS "tofotos_public_read" ON storage.objects;
DROP POLICY IF EXISTS "tofotos_auth_insert" ON storage.objects;
DROP POLICY IF EXISTS "tofotos_auth_update" ON storage.objects;
DROP POLICY IF EXISTS "tofotos_auth_delete" ON storage.objects;

CREATE POLICY "branding_public_read" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'branding');
CREATE POLICY "branding_auth_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'branding');
CREATE POLICY "branding_auth_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'branding') WITH CHECK (bucket_id = 'branding');
CREATE POLICY "branding_auth_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'branding');

CREATE POLICY "tofotos_public_read" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'to-fotos');
CREATE POLICY "tofotos_auth_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'to-fotos');
CREATE POLICY "tofotos_auth_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'to-fotos') WITH CHECK (bucket_id = 'to-fotos');
CREATE POLICY "tofotos_auth_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'to-fotos');