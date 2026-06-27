-- Cohear account/passport schema.
-- Apply in the Supabase SQL editor after confirming the project env vars are set.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  timezone text not null default 'America/Vancouver',
  currency text not null default 'USD',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.concert_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  concert_key text not null,
  artist text,
  venue text,
  city text,
  region text,
  country text,
  concert_date date,
  start_at timestamptz,
  timezone text,
  status text not null default 'visited' check (status in ('visited', 'attended')),
  source text,
  first_viewed_at timestamptz not null default now(),
  last_viewed_at timestamptz not null default now(),
  attended_at timestamptz,
  actions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, concert_key)
);

create index if not exists concert_history_user_last_viewed_idx
  on public.concert_history (user_id, last_viewed_at desc);

create index if not exists concert_history_user_artist_idx
  on public.concert_history (user_id, artist)
  where artist is not null;

create table if not exists public.passport_stamps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  concert_history_id uuid references public.concert_history(id) on delete cascade,
  concert_key text not null,
  serial text not null,
  edition integer not null,
  prompt text not null,
  image_url text,
  issued_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, concert_key),
  unique (serial)
);

create index if not exists passport_stamps_user_issued_idx
  on public.passport_stamps (user_id, issued_at desc);

alter table public.profiles enable row level security;
alter table public.concert_history enable row level security;
alter table public.passport_stamps enable row level security;

create policy "profiles read own"
  on public.profiles for select
  using ((select auth.uid()) = id);

create policy "profiles insert own"
  on public.profiles for insert
  with check ((select auth.uid()) = id);

create policy "profiles update own"
  on public.profiles for update
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "concert history read own"
  on public.concert_history for select
  using ((select auth.uid()) = user_id);

create policy "concert history insert own"
  on public.concert_history for insert
  with check ((select auth.uid()) = user_id);

create policy "concert history update own"
  on public.concert_history for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "passport stamps read own"
  on public.passport_stamps for select
  using ((select auth.uid()) = user_id);

create policy "passport stamps insert own"
  on public.passport_stamps for insert
  with check ((select auth.uid()) = user_id);

create policy "passport stamps update own"
  on public.passport_stamps for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Voice transcripts
create table if not exists public.voice_transcripts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  event_id text not null,
  transcript jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.voice_transcripts enable row level security;

create policy "voice transcripts read own"
  on public.voice_transcripts for select
  using ((select auth.uid()) = user_id);

create policy "voice transcripts insert own"
  on public.voice_transcripts for insert
  with check ((select auth.uid()) = user_id);

create policy "voice transcripts update own"
  on public.voice_transcripts for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- YouTube API Caching
create table if not exists public.youtube_cache (
  query text primary key,
  response jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.youtube_cache enable row level security;

create policy "youtube cache read all"
  on public.youtube_cache for select
  using (true);

create policy "youtube cache insert all"
  on public.youtube_cache for insert
  with check (true);

create policy "youtube cache update all"
  on public.youtube_cache for update
  using (true)
  with check (true);
