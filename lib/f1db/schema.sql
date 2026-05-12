-- driver_stats — pre-aggregated, era-bucketed driver metrics.
-- Mirrors the table written by scripts/sync-f1db.ts. Apply this to D1 before
-- importing the data dump.

DROP TABLE IF EXISTS driver_stats;

CREATE TABLE driver_stats (
  driverId    TEXT NOT NULL,
  eraId       TEXT NOT NULL,
  driverName  TEXT NOT NULL,
  countryCode TEXT,
  firstYear   INTEGER NOT NULL,
  lastYear    INTEGER NOT NULL,
  c REAL NOT NULL,  -- championships
  w REAL NOT NULL,  -- wins
  p REAL NOT NULL,  -- podiums
  q REAL NOT NULL,  -- poles
  f REAL NOT NULL,  -- fastest laps
  r REAL NOT NULL,  -- win rate
  h REAL NOT NULL,  -- teammate H2H (race+quali averaged)
  l REAL NOT NULL,  -- longevity (career years)
  d REAL NOT NULL,  -- peak dominance
  PRIMARY KEY (driverId, eraId)
);

CREATE INDEX idx_driver_stats_era ON driver_stats (eraId);
