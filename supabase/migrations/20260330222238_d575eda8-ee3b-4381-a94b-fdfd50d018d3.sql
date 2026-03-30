create table if not exists instellingen (
  id uuid primary key default gen_random_uuid(),
  bedrijfsnaam text default 'Terrevolt B.V.',
  regio text default 'Liander Zuidoost',
  logo_url text,
  profielfoto_url text,
  primary_color text default '150 100% 20%',
  primary_light_color text default '140 65% 66%',
  background_color text default '116 90% 96%',
  accent_gold_color text default '44 100% 23%',
  orange_color text default '15 82% 50%',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table instellingen disable row level security;

insert into instellingen (bedrijfsnaam, regio)
values ('Terrevolt B.V.', 'Liander Zuidoost');

insert into storage.buckets (id, name, public)
values ('branding', 'branding', true)
on conflict do nothing;

create policy "Public Access branding"
on storage.objects for all
using (bucket_id = 'branding')
with check (bucket_id = 'branding');