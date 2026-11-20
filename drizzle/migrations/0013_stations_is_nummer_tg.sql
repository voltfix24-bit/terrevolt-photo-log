ALTER TABLE public.stations ADD COLUMN is_nummer text;
ALTER TABLE public.stations ADD COLUMN tg boolean NOT NULL DEFAULT false;