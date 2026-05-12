// Editorial-color constants surfaced in the gutter + footer. These are
// updated by the F1DB sync script (and bumped manually when shipping a
// design pass). The "F1 2026 — RD 24/24" line is hardcoded color, not
// real-time data — see CONCEPT.md: no live race data in v1.
export const BUILD_DATA_VERSION = 'F1DB v2026.4.0'
export const BUILD_DATA_SYNC = '2026.04.21'
export const APP_VERSION = 'v0.2.0'
export const SEASON_STATUS = 'F1 2026 — RD 24/24'

// Hardcoded site-wide totals shown in the LiveStats block on the hero.
// These move only when the F1DB sync runs, so a build-time constant is
// fine and avoids hitting D1 from the landing page hero.
export const TOTAL_DRIVERS = 728
export const TOTAL_SEASONS = 75
export const TOTAL_RACES = 1134
