create extension if not exists pgcrypto;

create table if not exists public.seasons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  display_name text not null,
  competition text not null default 'E0',
  country text not null default 'England',
  league_name text not null default 'Premier League',
  is_complete boolean not null default false,
  source_url text not null,
  fixture_count integer not null default 0,
  imported_at timestamptz not null default now()
);

alter table public.seasons add column if not exists league_name text not null default 'Premier League';

create table if not exists public.fixtures (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  source_row integer not null,
  match_date date not null,
  home_team text not null,
  away_team text not null,
  full_time_home_goals integer not null,
  full_time_away_goals integer not null,
  full_time_result text not null check (full_time_result in ('H','D','A')),
  home_snapshot jsonb not null default '{}'::jsonb,
  away_snapshot jsonb not null default '{}'::jsonb,
  unique (season_id, source_row),
  unique (season_id, match_date, home_team, away_team)
);

create table if not exists public.daily_games (
  id uuid primary key default gen_random_uuid(),
  game_date date not null,
  country text not null default 'England',
  competition text not null default 'E0',
  league_name text not null default 'Premier League',
  season_id uuid not null references public.seasons(id),
  seed text not null,
  status text not null default 'open' check (status in ('open','closed')),
  winner_user_id uuid,
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  unique (game_date, country, competition)
);

alter table public.daily_games drop constraint if exists daily_games_game_date_key;
alter table public.daily_games add column if not exists country text not null default 'England';
alter table public.daily_games add column if not exists competition text not null default 'E0';
alter table public.daily_games add column if not exists league_name text not null default 'Premier League';
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'daily_games_game_date_country_competition_key'
  ) then
    alter table public.daily_games add constraint daily_games_game_date_country_competition_key unique (game_date, country, competition);
  end if;
end $$;

create table if not exists public.daily_game_fixtures (
  id uuid primary key default gen_random_uuid(),
  daily_game_id uuid not null references public.daily_games(id) on delete cascade,
  fixture_id uuid not null references public.fixtures(id) on delete cascade,
  round_number integer not null check (round_number between 1 and 38),
  options jsonb not null,
  unique (daily_game_id, fixture_id),
  unique (daily_game_id, round_number)
);

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  username text,
  country text not null default 'England',
  competition text not null default 'E0',
  league_name text not null default 'Premier League',
  pyramid_level integer not null default 1,
  created_at timestamptz not null default now()
);

alter table public.user_profiles add column if not exists username text;
alter table public.user_profiles add column if not exists country text not null default 'England';
alter table public.user_profiles add column if not exists competition text not null default 'E0';
alter table public.user_profiles add column if not exists league_name text not null default 'Premier League';

create table if not exists public.predictions (
  id uuid primary key default gen_random_uuid(),
  daily_game_fixture_id uuid not null references public.daily_game_fixtures(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  predicted_home_goals integer not null,
  predicted_away_goals integer not null,
  is_auto boolean not null default false,
  points integer not null default 0,
  exact_score boolean not null default false,
  correct_result boolean not null default false,
  created_at timestamptz not null default now(),
  unique (daily_game_fixture_id, user_id)
);

create table if not exists public.daily_results (
  id uuid primary key default gen_random_uuid(),
  daily_game_id uuid not null references public.daily_games(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  total_points integer not null default 0,
  correct_scores integer not null default 0,
  correct_results integer not null default 0,
  rank integer,
  pyramid_level_before integer not null default 1,
  pyramid_level_after integer not null default 1,
  movement text not null default 'stayed',
  created_at timestamptz not null default now(),
  unique (daily_game_id, user_id)
);

alter table public.seasons enable row level security;
alter table public.fixtures enable row level security;
alter table public.daily_games enable row level security;
alter table public.daily_game_fixtures enable row level security;
alter table public.user_profiles enable row level security;
alter table public.predictions enable row level security;
alter table public.daily_results enable row level security;

create policy "read seasons" on public.seasons for select using (true);
create policy "read fixtures" on public.fixtures for select using (true);
create policy "read daily games" on public.daily_games for select using (true);
create policy "read daily game fixtures" on public.daily_game_fixtures for select using (true);
create policy "read own profile" on public.user_profiles for select using (auth.uid() = user_id);
create policy "read own predictions" on public.predictions for select using (auth.uid() = user_id);
create policy "insert own predictions" on public.predictions for insert with check (auth.uid() = user_id);
create policy "read daily results" on public.daily_results for select using (true);
