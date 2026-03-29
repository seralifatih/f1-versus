-- ============================================================
-- GridRival — Initial Schema Migration
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- TABLES
-- ============================================================

create table if not exists drivers (
  id            uuid primary key default uuid_generate_v4(),
  driver_ref    text not null unique,   -- jolpica driverId e.g. "max_verstappen"
  first_name    text not null,
  last_name     text not null,
  dob           date,
  nationality   text,
  headshot_url  text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists constructors (
  id               uuid primary key default uuid_generate_v4(),
  constructor_ref  text not null unique,  -- e.g. "red_bull"
  name             text not null,
  color_hex        text not null default '#ffffff',  -- team brand color
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists circuits (
  id           uuid primary key default uuid_generate_v4(),
  circuit_ref  text not null unique,  -- e.g. "monza"
  name         text not null,
  country      text,
  lat          numeric(9, 6),
  lng          numeric(9, 6),
  type         text not null default 'permanent' check (type in ('street', 'permanent')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists races (
  id          uuid primary key default uuid_generate_v4(),
  season      integer not null,
  round       integer not null,
  circuit_id  uuid not null references circuits (id) on delete restrict,
  date        date,
  name        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (season, round)
);

create table if not exists results (
  id                  uuid primary key default uuid_generate_v4(),
  race_id             uuid not null references races (id) on delete cascade,
  driver_id           uuid not null references drivers (id) on delete cascade,
  constructor_id      uuid not null references constructors (id) on delete restrict,
  grid                integer,             -- null if no qualifying data
  position            integer,             -- null = DNF / DSQ / DNS
  points              numeric(6, 2) not null default 0,
  status              text,                -- "Finished", "+1 Lap", "Retired", etc.
  fastest_lap_time    text,                -- "1:23.456"
  fastest_lap_rank    integer,
  is_sprint           boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (race_id, driver_id, is_sprint)
);

create table if not exists qualifying (
  id              uuid primary key default uuid_generate_v4(),
  race_id         uuid not null references races (id) on delete cascade,
  driver_id       uuid not null references drivers (id) on delete cascade,
  constructor_id  uuid not null references constructors (id) on delete restrict,
  q1_time         text,  -- "1:23.456", null if did not participate
  q2_time         text,
  q3_time         text,
  position        integer,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (race_id, driver_id)
);

create table if not exists weather_conditions (
  id           uuid primary key default uuid_generate_v4(),
  race_id      uuid not null references races (id) on delete cascade unique,
  wet          boolean not null default false,
  temperature  numeric(4, 1),  -- Celsius
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists driver_comparisons (
  id               uuid primary key default uuid_generate_v4(),
  driver_a_id      uuid not null references drivers (id) on delete cascade,
  driver_b_id      uuid not null references drivers (id) on delete cascade,
  slug             text not null unique,   -- "verstappen-vs-hamilton"
  season           integer,               -- null = career aggregate
  -- primary computed blob (matches ComparisonResult type in lib/data/types.ts)
  stats_json       jsonb not null default '{}',
  -- alias kept for build-plan compatibility; mirrors stats_json
  computed_stats   jsonb not null default '{}',
  last_computed_at timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (driver_a_id, driver_b_id, season)
);

create table if not exists votes (
  id               uuid primary key default uuid_generate_v4(),
  comparison_slug  text not null,
  driver_ref       text not null,
  ip_hash          text not null,
  created_at       timestamptz not null default now(),
  unique (comparison_slug, ip_hash)  -- one vote per IP per comparison
);

-- ============================================================
-- INDEXES
-- ============================================================

-- results: fast lookup by driver and by race
create index if not exists results_driver_id_idx  on results (driver_id);
create index if not exists results_race_id_idx    on results (race_id);
create index if not exists results_driver_race_idx on results (driver_id, race_id);

-- qualifying: fast lookup by driver and by race
create index if not exists qualifying_driver_id_idx   on qualifying (driver_id);
create index if not exists qualifying_race_id_idx     on qualifying (race_id);
create index if not exists qualifying_driver_race_idx on qualifying (driver_id, race_id);

-- races: season filtering
create index if not exists races_season_idx on races (season);

-- driver_comparisons: slug lookup (used on every page load)
create index if not exists driver_comparisons_slug_idx on driver_comparisons (slug);
-- pair lookup used by compute script
create index if not exists driver_comparisons_pair_idx on driver_comparisons (driver_a_id, driver_b_id);

-- votes: slug aggregate queries
create index if not exists votes_slug_idx on votes (comparison_slug);

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger drivers_updated_at          before update on drivers          for each row execute function set_updated_at();
create trigger constructors_updated_at     before update on constructors     for each row execute function set_updated_at();
create trigger circuits_updated_at         before update on circuits         for each row execute function set_updated_at();
create trigger races_updated_at            before update on races            for each row execute function set_updated_at();
create trigger results_updated_at          before update on results          for each row execute function set_updated_at();
create trigger qualifying_updated_at       before update on qualifying       for each row execute function set_updated_at();
create trigger weather_conditions_updated  before update on weather_conditions for each row execute function set_updated_at();
create trigger driver_comparisons_updated  before update on driver_comparisons for each row execute function set_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table drivers              enable row level security;
alter table constructors         enable row level security;
alter table circuits             enable row level security;
alter table races                enable row level security;
alter table results              enable row level security;
alter table qualifying           enable row level security;
alter table weather_conditions   enable row level security;
alter table driver_comparisons   enable row level security;
alter table votes                enable row level security;

-- Public read on all tables
create policy "public_read_drivers"             on drivers             for select using (true);
create policy "public_read_constructors"        on constructors        for select using (true);
create policy "public_read_circuits"            on circuits            for select using (true);
create policy "public_read_races"               on races               for select using (true);
create policy "public_read_results"             on results             for select using (true);
create policy "public_read_qualifying"          on qualifying          for select using (true);
create policy "public_read_weather_conditions"  on weather_conditions  for select using (true);
create policy "public_read_driver_comparisons"  on driver_comparisons  for select using (true);
create policy "public_read_votes"               on votes               for select using (true);

-- Service role write (INSERT / UPDATE / DELETE) — anon/authenticated cannot mutate data
-- Supabase service role bypasses RLS by default, but explicit policies are clearer.
create policy "service_role_write_drivers"
  on drivers for all
  to service_role
  using (true) with check (true);

create policy "service_role_write_constructors"
  on constructors for all
  to service_role
  using (true) with check (true);

create policy "service_role_write_circuits"
  on circuits for all
  to service_role
  using (true) with check (true);

create policy "service_role_write_races"
  on races for all
  to service_role
  using (true) with check (true);

create policy "service_role_write_results"
  on results for all
  to service_role
  using (true) with check (true);

create policy "service_role_write_qualifying"
  on qualifying for all
  to service_role
  using (true) with check (true);

create policy "service_role_write_weather_conditions"
  on weather_conditions for all
  to service_role
  using (true) with check (true);

create policy "service_role_write_driver_comparisons"
  on driver_comparisons for all
  to service_role
  using (true) with check (true);

-- Votes: anyone can INSERT (vote), only service role can UPDATE/DELETE
create policy "public_insert_votes"
  on votes for insert
  to anon, authenticated
  with check (true);

create policy "service_role_write_votes"
  on votes for all
  to service_role
  using (true) with check (true);
