
create table if not exists categorie_opmerkingen (
  id uuid primary key default gen_random_uuid(),
  station_id uuid references stations(id) on delete cascade not null,
  categorie text not null,
  opmerking text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(station_id, categorie)
);

alter table categorie_opmerkingen enable row level security;

create policy "Anyone can view categorie_opmerkingen" on categorie_opmerkingen for select to public using (true);
create policy "Anyone can insert categorie_opmerkingen" on categorie_opmerkingen for insert to public with check (true);
create policy "Anyone can update categorie_opmerkingen" on categorie_opmerkingen for update to public using (true);
create policy "Anyone can delete categorie_opmerkingen" on categorie_opmerkingen for delete to public using (true);
