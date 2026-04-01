-- Run in Supabase SQL editor
create table if not exists public.killer_rooms (
  code text primary key check (code ~ '^[0-9]{4}$'),
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.killer_rooms replica identity full;
alter table public.killer_rooms enable row level security;

drop policy if exists "killer_rooms_all_select" on public.killer_rooms;
create policy "killer_rooms_all_select"
on public.killer_rooms
for select
to anon, authenticated
using (true);

drop policy if exists "killer_rooms_all_write" on public.killer_rooms;
create policy "killer_rooms_all_write"
on public.killer_rooms
for all
to anon, authenticated
using (true)
with check (true);
