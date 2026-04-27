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
grant select, insert, update, delete on table public.timer_pool_scores to anon, authenticated;
grant usage, select on sequence public.timer_pool_scores_id_seq to anon, authenticated;

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

drop policy if exists "timer_pool_scores_all_update" on public.timer_pool_scores;
create policy "timer_pool_scores_all_update"
on public.timer_pool_scores
for update
to anon, authenticated
using (true)
with check (true);

create table if not exists public.user_accounts (
  profile_id text primary key,
  username text not null,
  username_key text not null unique,
  password_hash text,
  password_salt text,
  password_version integer not null default 1,
  password text,
  created_at timestamptz not null default now()
);

alter table public.user_accounts
  add column if not exists password_hash text;

alter table public.user_accounts
  add column if not exists password_salt text;

alter table public.user_accounts
  add column if not exists password_version integer not null default 1;

alter table public.user_accounts
  add column if not exists password text;

alter table public.user_accounts
  alter column password drop not null;

-- Single active session per account: new login overwrites this; other clients poll and sign out.
alter table public.user_accounts
  add column if not exists active_session_id text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_accounts_password_presence_check'
      and conrelid = 'public.user_accounts'::regclass
  ) then
    alter table public.user_accounts
      add constraint user_accounts_password_presence_check
      check (
        (password_hash is not null and password_salt is not null)
        or password is not null
      );
  end if;
end
$$;

alter table public.user_accounts enable row level security;
grant select, insert, update on table public.user_accounts to anon, authenticated;

drop policy if exists "user_accounts_all_select" on public.user_accounts;
create policy "user_accounts_all_select"
on public.user_accounts
for select
to anon, authenticated
using (true);

drop policy if exists "user_accounts_all_insert" on public.user_accounts;
create policy "user_accounts_all_insert"
on public.user_accounts
for insert
to anon, authenticated
with check (true);

drop policy if exists "user_accounts_all_update" on public.user_accounts;
create policy "user_accounts_all_update"
on public.user_accounts
for update
to anon, authenticated
using (true)
with check (true);

create table if not exists public.user_friends (
  owner_profile_id text not null,
  friend_profile_id text not null,
  friend_username text not null,
  created_at timestamptz not null default now(),
  primary key (owner_profile_id, friend_profile_id),
  check (owner_profile_id <> friend_profile_id)
);

alter table public.user_friends enable row level security;
grant select, insert, delete on table public.user_friends to anon, authenticated;

drop policy if exists "user_friends_all_select" on public.user_friends;
create policy "user_friends_all_select"
on public.user_friends
for select
to anon, authenticated
using (true);

drop policy if exists "user_friends_all_insert" on public.user_friends;
create policy "user_friends_all_insert"
on public.user_friends
for insert
to anon, authenticated
with check (true);

drop policy if exists "user_friends_all_delete" on public.user_friends;
create policy "user_friends_all_delete"
on public.user_friends
for delete
to anon, authenticated
using (true);
