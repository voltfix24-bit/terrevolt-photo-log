
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_label text,
  created_at timestamptz default now()
);

alter table push_subscriptions enable row level security;
create policy "Anyone can view push_subscriptions" on push_subscriptions for select to public using (true);
create policy "Anyone can insert push_subscriptions" on push_subscriptions for insert to public with check (true);
create policy "Anyone can update push_subscriptions" on push_subscriptions for update to public using (true);
create policy "Anyone can delete push_subscriptions" on push_subscriptions for delete to public using (true);

alter table stations add column if not exists status text default 'concept';
