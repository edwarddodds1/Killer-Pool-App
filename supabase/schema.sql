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

create table if not exists public.timer_pool_scores (
  id bigint generated always as identity primary key,
  profile_id text not null,
  username text not null,
  elapsed_ms integer not null check (elapsed_ms > 0),
  created_at timestamptz not null default now()
);

alter table public.timer_pool_scores enable row level security;

drop policy if exists "timer_pool_scores_all_select" on public.timer_pool_scores;
create policy "timer_pool_scores_all_select"
on public.timer_pool_scores
for select
to anon, authenticated
using (true);

drop policy if exists "timer_pool_scores_all_insert" on public.timer_pool_scores;
create policy "timer_pool_scores_all_insert"
on public.timer_pool_scores
for insert
to anon, authenticated
with check (true);

drop policy if exists "timer_pool_scores_all_delete" on public.timer_pool_scores;
create policy "timer_pool_scores_all_delete"
on public.timer_pool_scores
for delete
to anon, authenticated
using (true);
