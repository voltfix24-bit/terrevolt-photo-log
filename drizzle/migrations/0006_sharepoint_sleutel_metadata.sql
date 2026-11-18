ALTER TABLE public.instellingen
  ADD COLUMN IF NOT EXISTS sp_sleutel_verloopt_op date,
  ADD COLUMN IF NOT EXISTS sp_sleutel_automatisch boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sp_auth_fout text,
  ADD COLUMN IF NOT EXISTS sp_machtigingen_nodig text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS sp_gecontroleerd_op timestamptz;