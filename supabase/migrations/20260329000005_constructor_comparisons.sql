-- ============================================================
-- Constructor comparisons cache table
-- Mirrors driver_comparisons but for constructor head-to-heads.
-- ============================================================

create table if not exists constructor_comparisons (
  id                   uuid primary key default uuid_generate_v4(),
  constructor_a_id     uuid not null references constructors (id) on delete cascade,
  constructor_b_id     uuid not null references constructors (id) on delete cascade,
  slug                 text not null unique,        -- "ferrari-vs-mclaren" (canonical alphabetical)
  stats_json           jsonb,                       -- TeamComparisonResult blob
  last_computed_at     timestamptz not null default now(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (constructor_a_id, constructor_b_id)
);

-- Index for slug lookups (every page load)
create index if not exists constructor_comparisons_slug_idx
  on constructor_comparisons (slug);

-- Index for pair lookups
create index if not exists constructor_comparisons_pair_idx
  on constructor_comparisons (constructor_a_id, constructor_b_id);

-- RLS: public read, service-role write
alter table constructor_comparisons enable row level security;

create policy "Public read constructor comparisons"
  on constructor_comparisons for select
  using (true);

-- Constructor standings table (used by team-compute.ts for championship count)
-- If it already exists from another migration this will be a no-op.
create table if not exists constructor_standings (
  id                uuid primary key default uuid_generate_v4(),
  constructor_id    uuid not null references constructors (id) on delete cascade,
  season            integer not null,
  position          integer not null,
  points            numeric(8, 2) not null default 0,
  wins              integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (constructor_id, season)
);

create index if not exists constructor_standings_constructor_idx
  on constructor_standings (constructor_id);

create index if not exists constructor_standings_season_idx
  on constructor_standings (season);

alter table constructor_standings enable row level security;

create policy "Public read constructor standings"
  on constructor_standings for select
  using (true);
