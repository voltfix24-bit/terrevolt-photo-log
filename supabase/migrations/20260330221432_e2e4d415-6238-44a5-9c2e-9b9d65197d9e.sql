create table if not exists monteurs (
  id uuid primary key default gen_random_uuid(),
  naam text not null,
  created_at timestamptz default now()
);

alter table monteurs disable row level security;