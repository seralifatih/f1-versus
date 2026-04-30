-- ============================================================
-- F1-Versus — D1 (SQLite) Schema
-- ============================================================
-- Key differences from Supabase/Postgres schema:
--   • No uuid type — id columns use TEXT, default via INSERT (randomblob hex)
--   • No jsonb — use TEXT, store/read as JSON.stringify / JSON.parse
--   • No timestamptz — use TEXT (ISO-8601)
--   • No triggers — updated_at set explicitly in application code
--   • No RLS — D1 is server-side only; access control is in application code
--   • No uuid_generate_v4() — app generates IDs with crypto.randomUUID()
-- ============================================================

-- ─── drivers ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS drivers (
  id            TEXT PRIMARY KEY,
  driver_ref    TEXT NOT NULL UNIQUE,
  first_name    TEXT NOT NULL,
  last_name     TEXT NOT NULL,
  dob           TEXT,
  nationality   TEXT,
  headshot_url  TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ─── constructors ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS constructors (
  id               TEXT PRIMARY KEY,
  constructor_ref  TEXT NOT NULL UNIQUE,
  name             TEXT NOT NULL,
  color_hex        TEXT NOT NULL DEFAULT '#ffffff',
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ─── circuits ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS circuits (
  id           TEXT PRIMARY KEY,
  circuit_ref  TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  country      TEXT,
  lat          REAL,
  lng          REAL,
  type         TEXT NOT NULL DEFAULT 'permanent' CHECK (type IN ('street', 'permanent')),
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ─── races ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS races (
  id          TEXT PRIMARY KEY,
  season      INTEGER NOT NULL,
  round       INTEGER NOT NULL,
  circuit_id  TEXT NOT NULL REFERENCES circuits (id) ON DELETE RESTRICT,
  date        TEXT,
  name        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (season, round)
);

-- ─── results ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS results (
  id                  TEXT PRIMARY KEY,
  race_id             TEXT NOT NULL REFERENCES races (id) ON DELETE CASCADE,
  driver_id           TEXT NOT NULL REFERENCES drivers (id) ON DELETE CASCADE,
  constructor_id      TEXT NOT NULL REFERENCES constructors (id) ON DELETE RESTRICT,
  grid                INTEGER,
  position            INTEGER,
  points              REAL NOT NULL DEFAULT 0,
  status              TEXT,
  fastest_lap_time    TEXT,
  fastest_lap_rank    INTEGER,
  is_sprint           INTEGER NOT NULL DEFAULT 0,  -- 0=false, 1=true (SQLite has no BOOLEAN)
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (race_id, driver_id, is_sprint)
);

-- ─── qualifying ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS qualifying (
  id              TEXT PRIMARY KEY,
  race_id         TEXT NOT NULL REFERENCES races (id) ON DELETE CASCADE,
  driver_id       TEXT NOT NULL REFERENCES drivers (id) ON DELETE CASCADE,
  constructor_id  TEXT NOT NULL REFERENCES constructors (id) ON DELETE RESTRICT,
  q1_time         TEXT,
  q2_time         TEXT,
  q3_time         TEXT,
  position        INTEGER,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (race_id, driver_id)
);

-- ─── weather_conditions ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS weather_conditions (
  id           TEXT PRIMARY KEY,
  race_id      TEXT NOT NULL REFERENCES races (id) ON DELETE CASCADE UNIQUE,
  wet          INTEGER NOT NULL DEFAULT 0,  -- 0=false, 1=true
  temperature  REAL,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ─── driver_comparisons ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS driver_comparisons (
  id                       TEXT PRIMARY KEY,
  driver_a_id              TEXT NOT NULL REFERENCES drivers (id) ON DELETE CASCADE,
  driver_b_id              TEXT NOT NULL REFERENCES drivers (id) ON DELETE CASCADE,
  slug                     TEXT NOT NULL UNIQUE,
  season                   INTEGER,
  stats_json               TEXT NOT NULL DEFAULT '{}',
  computed_stats           TEXT NOT NULL DEFAULT '{}',
  last_computed_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ai_summary               TEXT,
  ai_summary_generated_at  TEXT,
  created_at               TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at               TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (driver_a_id, driver_b_id, season)
);

-- ─── votes ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS votes (
  id               TEXT PRIMARY KEY,
  comparison_slug  TEXT NOT NULL,
  driver_ref       TEXT NOT NULL,
  ip_hash          TEXT NOT NULL,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (comparison_slug, ip_hash)
);

-- ─── constructor_comparisons ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS constructor_comparisons (
  id                   TEXT PRIMARY KEY,
  constructor_a_id     TEXT NOT NULL REFERENCES constructors (id) ON DELETE CASCADE,
  constructor_b_id     TEXT NOT NULL REFERENCES constructors (id) ON DELETE CASCADE,
  slug                 TEXT NOT NULL UNIQUE,
  stats_json           TEXT,
  last_computed_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (constructor_a_id, constructor_b_id)
);

-- ─── constructor_standings ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS constructor_standings (
  id              TEXT PRIMARY KEY,
  constructor_id  TEXT NOT NULL REFERENCES constructors (id) ON DELETE CASCADE,
  season          INTEGER NOT NULL,
  position        INTEGER NOT NULL,
  points          REAL NOT NULL DEFAULT 0,
  wins            INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (constructor_id, season)
);

-- ─── metric_distributions ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS metric_distributions (
  metric_name  TEXT PRIMARY KEY,
  p10          REAL NOT NULL,
  p50          REAL NOT NULL,
  p90          REAL NOT NULL,
  max          REAL NOT NULL,
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS results_driver_id_idx    ON results (driver_id);
CREATE INDEX IF NOT EXISTS results_race_id_idx      ON results (race_id);
CREATE INDEX IF NOT EXISTS results_driver_race_idx  ON results (driver_id, race_id);

CREATE INDEX IF NOT EXISTS qualifying_driver_id_idx   ON qualifying (driver_id);
CREATE INDEX IF NOT EXISTS qualifying_race_id_idx     ON qualifying (race_id);
CREATE INDEX IF NOT EXISTS qualifying_driver_race_idx ON qualifying (driver_id, race_id);

CREATE INDEX IF NOT EXISTS races_season_idx ON races (season);

CREATE INDEX IF NOT EXISTS driver_comparisons_slug_idx ON driver_comparisons (slug);
CREATE INDEX IF NOT EXISTS driver_comparisons_pair_idx ON driver_comparisons (driver_a_id, driver_b_id);

CREATE INDEX IF NOT EXISTS votes_slug_idx ON votes (comparison_slug);

CREATE INDEX IF NOT EXISTS constructor_comparisons_slug_idx ON constructor_comparisons (slug);
CREATE INDEX IF NOT EXISTS constructor_comparisons_pair_idx ON constructor_comparisons (constructor_a_id, constructor_b_id);

CREATE INDEX IF NOT EXISTS constructor_standings_constructor_idx ON constructor_standings (constructor_id);
CREATE INDEX IF NOT EXISTS constructor_standings_season_idx      ON constructor_standings (season);
