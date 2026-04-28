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

-- ---------------------------------------------------------------------------
-- Social layer (mobile + web). IDs reference public.user_accounts(profile_id).
-- This app uses custom accounts with the anon key, not Supabase Auth JWTs, so
-- policies match existing tables (anon/authenticated broad access). Tighten
-- with auth.uid() when you migrate to Supabase Auth.
-- ---------------------------------------------------------------------------

do $$ begin
  create type public.friendship_status as enum ('pending', 'accepted', 'declined');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.profile_pictures (
  id uuid primary key default gen_random_uuid(),
  profile_id text not null references public.user_accounts (profile_id) on delete cascade,
  storage_url text not null,
  uploaded_at timestamptz not null default now(),
  unique (profile_id)
);

alter table public.profile_pictures enable row level security;
grant select, insert, update, delete on table public.profile_pictures to anon, authenticated;

drop policy if exists "profile_pictures_all_select" on public.profile_pictures;
create policy "profile_pictures_all_select"
on public.profile_pictures for select to anon, authenticated using (true);

drop policy if exists "profile_pictures_all_insert" on public.profile_pictures;
create policy "profile_pictures_all_insert"
on public.profile_pictures for insert to anon, authenticated with check (true);

drop policy if exists "profile_pictures_all_update" on public.profile_pictures;
create policy "profile_pictures_all_update"
on public.profile_pictures for update to anon, authenticated using (true) with check (true);

drop policy if exists "profile_pictures_all_delete" on public.profile_pictures;
create policy "profile_pictures_all_delete"
on public.profile_pictures for delete to anon, authenticated using (true);

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_profile_id text not null references public.user_accounts (profile_id) on delete cascade,
  recipient_profile_id text not null references public.user_accounts (profile_id) on delete cascade,
  status public.friendship_status not null default 'pending',
  created_at timestamptz not null default now(),
  check (requester_profile_id <> recipient_profile_id),
  unique (requester_profile_id, recipient_profile_id)
);

create index if not exists friendships_recipient_status_idx
  on public.friendships (recipient_profile_id, status);

create index if not exists friendships_requester_status_idx
  on public.friendships (requester_profile_id, status);

alter table public.friendships enable row level security;
grant select, insert, update, delete on table public.friendships to anon, authenticated;

drop policy if exists "friendships_all_select" on public.friendships;
create policy "friendships_all_select"
on public.friendships for select to anon, authenticated using (true);

drop policy if exists "friendships_all_insert" on public.friendships;
create policy "friendships_all_insert"
on public.friendships for insert to anon, authenticated with check (true);

drop policy if exists "friendships_all_update" on public.friendships;
create policy "friendships_all_update"
on public.friendships for update to anon, authenticated using (true) with check (true);

drop policy if exists "friendships_all_delete" on public.friendships;
create policy "friendships_all_delete"
on public.friendships for delete to anon, authenticated using (true);

-- One-time: copy legacy directional friends into accepted friendships (idempotent).
insert into public.friendships (requester_profile_id, recipient_profile_id, status, created_at)
select owner_profile_id, friend_profile_id, 'accepted'::public.friendship_status, created_at
from public.user_friends uf
on conflict (requester_profile_id, recipient_profile_id) do nothing;

create table if not exists public.head_to_head_games (
  id uuid primary key default gen_random_uuid(),
  player_one_profile_id text not null references public.user_accounts (profile_id) on delete cascade,
  player_two_profile_id text not null references public.user_accounts (profile_id) on delete cascade,
  winner_profile_id text not null references public.user_accounts (profile_id) on delete cascade,
  player_one_balls_remaining integer not null check (player_one_balls_remaining >= 0 and player_one_balls_remaining <= 15),
  player_two_balls_remaining integer not null check (player_two_balls_remaining >= 0 and player_two_balls_remaining <= 15),
  played_at timestamptz not null default now(),
  check (player_one_profile_id <> player_two_profile_id),
  check (
    winner_profile_id = player_one_profile_id
    or winner_profile_id = player_two_profile_id
  )
);

create index if not exists head_to_head_pair_idx on public.head_to_head_games (
  player_one_profile_id,
  player_two_profile_id,
  played_at desc
);

alter table public.head_to_head_games enable row level security;
grant select, insert, update, delete on table public.head_to_head_games to anon, authenticated;

drop policy if exists "head_to_head_all_select" on public.head_to_head_games;
create policy "head_to_head_all_select"
on public.head_to_head_games for select to anon, authenticated using (true);

drop policy if exists "head_to_head_all_insert" on public.head_to_head_games;
create policy "head_to_head_all_insert"
on public.head_to_head_games for insert to anon, authenticated with check (true);

drop policy if exists "head_to_head_all_update" on public.head_to_head_games;
create policy "head_to_head_all_update"
on public.head_to_head_games for update to anon, authenticated using (true) with check (true);

drop policy if exists "head_to_head_all_delete" on public.head_to_head_games;
create policy "head_to_head_all_delete"
on public.head_to_head_games for delete to anon, authenticated using (true);

create table if not exists public.feed_posts (
  id uuid primary key default gen_random_uuid(),
  poster_profile_id text not null references public.user_accounts (profile_id) on delete cascade,
  opponent_profile_id text references public.user_accounts (profile_id) on delete set null,
  winner_profile_id text references public.user_accounts (profile_id) on delete set null,
  image_url_left text not null,
  image_url_right text not null,
  caption text,
  created_at timestamptz not null default now(),
  check (opponent_profile_id is null or opponent_profile_id <> poster_profile_id),
  check (
    winner_profile_id is null
    or winner_profile_id = poster_profile_id
    or winner_profile_id = opponent_profile_id
  )
);

create index if not exists feed_posts_poster_created_idx
  on public.feed_posts (poster_profile_id, created_at desc);

alter table public.feed_posts enable row level security;
grant select, insert, update, delete on table public.feed_posts to anon, authenticated;

drop policy if exists "feed_posts_all_select" on public.feed_posts;
create policy "feed_posts_all_select"
on public.feed_posts for select to anon, authenticated using (true);

drop policy if exists "feed_posts_all_insert" on public.feed_posts;
create policy "feed_posts_all_insert"
on public.feed_posts for insert to anon, authenticated with check (true);

drop policy if exists "feed_posts_all_update" on public.feed_posts;
create policy "feed_posts_all_update"
on public.feed_posts for update to anon, authenticated using (true) with check (true);

drop policy if exists "feed_posts_all_delete" on public.feed_posts;
create policy "feed_posts_all_delete"
on public.feed_posts for delete to anon, authenticated using (true);

-- Storage: public bucket for social images (run in Supabase; requires storage extension).
insert into storage.buckets (id, name, public)
values ('social-images', 'social-images', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "social_images_public_read" on storage.objects;
create policy "social_images_public_read"
on storage.objects for select
using (bucket_id = 'social-images');

drop policy if exists "social_images_anon_upload" on storage.objects;
create policy "social_images_anon_upload"
on storage.objects for insert to anon, authenticated
with check (bucket_id = 'social-images');

drop policy if exists "social_images_anon_update" on storage.objects;
create policy "social_images_anon_update"
on storage.objects for update to anon, authenticated
using (bucket_id = 'social-images')
with check (bucket_id = 'social-images');

drop policy if exists "social_images_anon_delete" on storage.objects;
create policy "social_images_anon_delete"
on storage.objects for delete to anon, authenticated
using (bucket_id = 'social-images');
