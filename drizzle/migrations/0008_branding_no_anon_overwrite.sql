DROP POLICY IF EXISTS "Public Access branding" ON storage.objects;
CREATE POLICY branding_anon_insert ON storage.objects FOR INSERT TO anon WITH CHECK (bucket_id = 'branding');