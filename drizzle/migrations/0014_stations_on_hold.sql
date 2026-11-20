CREATE TYPE public.on_hold_partij AS ENUM ('terrevolt','van_gelder','liander','derden');
ALTER TABLE public.stations
  ADD COLUMN on_hold boolean NOT NULL DEFAULT false,
  ADD COLUMN on_hold_reden text,
  ADD COLUMN on_hold_sinds date,
  ADD COLUMN on_hold_tot date,
  ADD COLUMN on_hold_partij public.on_hold_partij;