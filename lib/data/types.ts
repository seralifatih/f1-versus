// ─── Database Row Types ────────────────────────────────────────────────────

export interface Driver {
  id: string;
  driver_ref: string;
  first_name: string;
  last_name: string;
  dob: string | null;
  nationality: string | null;
  headshot_url: string | null;
}

export interface Constructor {
  id: string;
  constructor_ref: string;
  name: string;
  color_hex: string | null;
}

export interface Circuit {
  id: string;
  circuit_ref: string;
  name: string;
  country: string | null;
  lat: number | null;
  lng: number | null;
  type: "street" | "permanent" | null;
}

export interface Race {
  id: string;
  season: number;
  round: number;
  circuit_id: string;
  date: string;
  name: string;
}

export interface Result {
  id: string;
  race_id: string;
  driver_id: string;
  constructor_id: string;
  grid: number | null;
  /** null means DNF / DSQ / DNS */
  position: number | null;
  points: number;
  status: string | null;
  fastest_lap_time: string | null;
  fastest_lap_rank: number | null;
}

export interface Qualifying {
  id: string;
  race_id: string;
  driver_id: string;
  constructor_id: string;
  q1_time: string | null;
  q2_time: string | null;
  q3_time: string | null;
  /** null if did not set a lap time in any session */
  position: number | null;
}

export interface WeatherCondition {
  id: string;
  race_id: string;
  wet: boolean;
  temperature: number | null;
}

export interface DriverComparison {
  id: string;
  driver_a_id: string;
  driver_b_id: string;
  /** null = all-time, number = single season */
  season: number | null;
  stats_json: ComparisonResult;
  last_computed_at: string;
}

export interface Vote {
  id: string;
  comparison_slug: string;
  driver_ref: string;
  ip_hash: string;
  created_at: string;
}

// ─── Computation Types ─────────────────────────────────────────────────────

/**
 * Raw per-driver stats used during computation before normalization.
 */
export interface DriverStats {
  driverRef: string;
  driverId: string;
  totalRaces: number;
  wins: number;
  poles: number;
  podiums: number;
  dnfs: number;
  /** Total points earned (normalized to post-2010 system when mixing eras) */
  totalPoints: number;
  pointsPerRace: number;
  avgFinishPosition: number;
  avgGridPosition: number;
  /** Average positions gained from grid to finish (positive = gained) */
  avgPositionsGained: number;
  /** % of races where driver finished higher than they started (0–1) */
  positionsGainedRate: number;
  /**
   * Consistency score derived from finish-position standard deviation.
   * Higher is better; 1 means very consistent, 0 means highly variable.
   */
  consistencyScore: number;
  fastestLaps: number;
  /** Head-to-head between these two compared drivers (when they were teammates) */
  teammateRecord: TeammateRecord;
  /** Record vs every teammate this driver has ever had, sorted by most races */
  allTeammateRecords: AllTimeTeammateRecord[];
  /** Per-season breakdown */
  seasonBreakdown: SeasonStats[];
  /** Circuit-type performance */
  streetCircuitRecord: CircuitPerformance;
  permanentCircuitRecord: CircuitPerformance;
}

export interface TeammateRecord {
  /** Number of races where both drivers finished and were teammates */
  racesCompared: number;
  driverAheadCount: number;
  driverBehindCount: number;
  /** Positive means this driver usually finishes ahead */
  averageGapPositions: number;
  /** Qualifying: how many times this driver out-qualified the teammate */
  qualiAheadCount: number;
  qualiBehindCount: number;
}

/** Per-teammate career record — used in the TeammateBattle section */
export interface AllTimeTeammateRecord {
  teammateRef: string;
  teammateName: string;
  /** Constructor(s) they shared */
  constructorNames: string[];
  racesCompared: number;
  driverAheadCount: number;
  driverBehindCount: number;
  qualiAheadCount: number;
  qualiBehindCount: number;
}

export interface SeasonStats {
  season: number;
  races: number;
  wins: number;
  podiums: number;
  poles: number;
  points: number;
  normalizedPoints: number;
  championship_position: number | null;
}

export interface CircuitPerformance {
  races: number;
  wins: number;
  podiums: number;
  dnfs: number;
  avgFinish: number;
}

/** Per-circuit head-to-head data for both drivers — used in CircuitBreakdown */
export interface CircuitBreakdownRow {
  circuitRef: string;
  circuitName: string;
  country: string | null;
  type: "street" | "permanent" | null;
  /** Individual race results at this circuit, newest first */
  racesA: CircuitRaceResult[];
  racesB: CircuitRaceResult[];
  /** Aggregates */
  statsA: CircuitBreakdownStats;
  statsB: CircuitBreakdownStats;
}

export interface CircuitBreakdownStats {
  races: number;
  wins: number;
  podiums: number;
  poles: number;
  bestFinish: number | null;
  avgFinish: number | null;
  dnfs: number;
}

export interface CircuitRaceResult {
  season: number;
  round: number;
  raceName: string;
  date: string;
  position: number | null;
  grid: number | null;
  points: number;
  status: string | null;
  /** qualifying position */
  qualiPosition: number | null;
  wet: boolean;
}

/**
 * Radar chart metric — each metric is normalized 0–10.
 */
export interface RadarMetric {
  metric: string;
  label: string;
  driverA: number;
  driverB: number;
  /** Higher is better? Inverted metrics (e.g. DNF rate) will be set to false */
  higherIsBetter: boolean;
  /**
   * Human-readable all-time percentile label for each driver, e.g. "Top 3%".
   * Only present when global distributions were available at compute time.
   */
  percentileA?: string;
  percentileB?: string;
}

/**
 * One row of the metric_distributions table.
 * Populated by compute-comparisons.ts after each full run.
 */
export interface MetricDistribution {
  metric_name: string;
  p10: number;
  p50: number;
  p90: number;
  max: number;
}

/**
 * Head-to-head record for races where both drivers competed in the same race.
 */
export interface HeadToHeadRecord {
  totalRaces: number;
  driverAWins: number;
  driverBWins: number;
  ties: number;
}

/**
 * The full comparison result stored in driver_comparisons.stats_json.
 */
export interface ComparisonResult {
  generatedAt: string;
  filters: ComparisonFilters;
  driverA: Driver;
  driverB: Driver;
  statsA: DriverStats;
  statsB: DriverStats;
  headToHead: HeadToHeadRecord;
  radarMetrics: RadarMetric[];
  sharedSeasons: number[];
  /** Slug in canonical (alphabetical) order */
  canonicalSlug: string;
  /** True when the two drivers raced in different eras (no shared seasons) */
  cross_era: boolean;
}

export interface ComparisonFilters {
  season?: number;
  /** Only races where both drivers were teammates */
  teammatesOnly?: boolean;
  circuitType?: "street" | "permanent";
  /** Only wet-weather races (requires weather_conditions table data) */
  wetOnly?: boolean;
}

// ─── Team / Constructor Comparison Types ──────────────────────────────────

export interface TeamSeasonStats {
  season: number;
  races: number;
  wins: number;
  podiums: number;
  poles: number;
  oneTwos: number;
  points: number;
  normalizedPoints: number;
  championship_position: number | null;
  drivers: string[]; // display names of drivers that season
}

export interface TeamStats {
  constructorId: string;
  constructorRef: string;
  name: string;
  color: string;
  totalRaces: number;
  wins: number;
  poles: number;
  podiums: number;
  oneTwos: number;
  dnfs: number;
  championships: number;
  totalPoints: number;
  pointsPerRace: number;
  podiumRate: number;
  winRate: number;
  firstSeason: number | null;
  lastSeason: number | null;
  seasonBreakdown: TeamSeasonStats[];
  driverLineup: TeamDriverEntry[];
  bestSeason: TeamSeasonStats | null;
  worstSeason: TeamSeasonStats | null;
}

export interface TeamDriverEntry {
  driverRef: string;
  name: string;
  seasons: number[];
  races: number;
  wins: number;
  podiums: number;
}

export interface TeamComparisonResult {
  generatedAt: string;
  constructorA: Constructor;
  constructorB: Constructor;
  statsA: TeamStats;
  statsB: TeamStats;
  headToHead: TeamHeadToHeadRecord;
  radarMetrics: RadarMetric[];
  sharedSeasons: number[];
  canonicalSlug: string;
}

export interface TeamHeadToHeadRecord {
  /** Seasons both teams competed; within each season: who scored more points */
  totalSharedSeasons: number;
  seasonWinsA: number;
  seasonWinsB: number;
  /** Race-level: within each shared race, who finished higher (best driver) */
  raceLeadsA: number;
  raceLeadsB: number;
}

/**
 * Builds a canonical team comparison slug from two constructor refs.
 * Alphabetical order by ref.
 * @example buildTeamSlug("ferrari", "mclaren") → "ferrari-vs-mclaren"
 */
export function buildTeamSlug(refA: string, refB: string): string {
  const [first, second] = [refA, refB].sort((a, b) => a.localeCompare(b));
  return `${first}-vs-${second}`;
}

// ─── Jolpica API Response Types ────────────────────────────────────────────

export interface JolpicaResponse<T> {
  MRData: {
    xmlns: string;
    series: string;
    url: string;
    limit: string;
    offset: string;
    total: string;
    RaceTable?: { Races: T[] };
    DriverTable?: { Drivers: T[] };
    ConstructorTable?: { Constructors: T[] };
    SeasonTable?: { Seasons: T[] };
  };
}

export interface JolpicaDriver {
  driverId: string;
  permanentNumber?: string;
  code?: string;
  url?: string;
  givenName: string;
  familyName: string;
  dateOfBirth?: string;
  nationality?: string;
}

export interface JolpicaConstructor {
  constructorId: string;
  url?: string;
  name: string;
  nationality?: string;
}

export interface JolpicaRace {
  season: string;
  round: string;
  url?: string;
  raceName: string;
  Circuit: {
    circuitId: string;
    url?: string;
    circuitName: string;
    Location: {
      lat: string;
      long: string;
      locality: string;
      country: string;
    };
  };
  date: string;
  Results?: JolpicaResult[];
  QualifyingResults?: JolpicaQualifyingResult[];
  SprintResults?: JolpicaResult[];
}

export interface JolpicaResult {
  number: string;
  position: string;
  positionText: string;
  points: string;
  Driver: JolpicaDriver;
  Constructor: JolpicaConstructor;
  grid: string;
  laps: string;
  status: string;
  Time?: { millis: string; time: string };
  FastestLap?: {
    rank: string;
    lap: string;
    Time: { time: string };
    AverageSpeed?: { units: string; speed: string };
  };
}

export interface JolpicaQualifyingResult {
  number: string;
  position: string;
  Driver: JolpicaDriver;
  Constructor: JolpicaConstructor;
  Q1?: string;
  Q2?: string;
  Q3?: string;
}

// ─── Helper / Utility Types ────────────────────────────────────────────────

/**
 * Extracts the last-name segment from a Jolpica driver ref for sort purposes.
 * Jolpica refs are `firstname_lastname` (e.g. `max_verstappen`, `lewis_hamilton`).
 * Single-segment refs (e.g. `senna`, `prost`) are returned as-is.
 *
 * @example refLastName("max_verstappen") → "verstappen"
 * @example refLastName("michael_schumacher") → "schumacher"
 * @example refLastName("mick_schumacher") → "schumacher"
 * @example refLastName("senna") → "senna"
 */
export function refLastName(driverRef: string): string {
  const idx = driverRef.lastIndexOf("_");
  return idx === -1 ? driverRef : driverRef.slice(idx + 1);
}

/**
 * Builds a comparison slug from two Jolpica driver refs.
 * Canonical order: alphabetical by last name (extracted from ref).
 * Tie-break on full ref so Schumacher M vs Schumacher R is deterministic.
 * URL tokens are the full driver refs.
 *
 * @example buildComparisonSlug("max_verstappen", "lewis_hamilton") → "lewis_hamilton-vs-max_verstappen"
 * @example buildComparisonSlug("michael_schumacher", "mick_schumacher") → "michael_schumacher-vs-mick_schumacher"
 */
export function buildComparisonSlug(
  driverARef: string,
  driverBRef: string
): string {
  const [first, second] = [driverARef, driverBRef].sort((a, b) => {
    const lastA = refLastName(a);
    const lastB = refLastName(b);
    const byLast = lastA.localeCompare(lastB);
    return byLast !== 0 ? byLast : a.localeCompare(b); // tie-break on full ref
  });
  return `${first}-vs-${second}`;
}

/** Parses a comparison slug into the two driver refs. */
export function parseComparisonSlug(
  slug: string
): { driverARef: string; driverBRef: string } | null {
  const match = slug.match(/^(.+)-vs-(.+)$/);
  if (!match) return null;
  return { driverARef: match[1], driverBRef: match[2] };
}

/** Returns true if a Jolpica position string represents a valid finish. */
export function isValidPosition(position: string | null | undefined): boolean {
  if (!position) return false;
  if (position === "\\N" || position === "N") return false;
  const n = parseInt(position, 10);
  return !isNaN(n) && n > 0;
}

/** Parses a Jolpica position string to number or null. */
export function parsePosition(position: string | null | undefined): number | null {
  if (!isValidPosition(position)) return null;
  return parseInt(position!, 10);
}

// ─── Helper Functions ──────────────────────────────────────────────────────

/**
 * Returns the URL slug for a driver.
 * Uses the driver's last name (lowercased, hyphenated).
 * Falls back to driver_ref if last_name is empty.
 *
 * @example getDriverSlug(verstappenDriver) → "verstappen"
 * @example getDriverSlug({ first_name: "Max", last_name: "Verstappen" }) → "verstappen"
 */
export function getDriverSlug(driver: Pick<Driver, "driver_ref" | "first_name" | "last_name">): string {
  const lastName = driver.last_name.trim().toLowerCase().replace(/\s+/g, "-");
  return lastName || driver.driver_ref;
}

/**
 * Returns the canonical comparison slug for two drivers.
 * Canonical order: alphabetical by last name; tie-break on driver_ref.
 * Tokens are last-name-based (via getDriverSlug).
 *
 * @example getComparisonSlug(hamiltonDriver, verstappenDriver) → "hamilton-vs-verstappen"
 * @example getComparisonSlug(michaelDriver, mickDriver) → "michael_schumacher-vs-mick_schumacher" (uses driver_ref via getDriverSlug fallback)
 */
export function getComparisonSlug(
  driverA: Pick<Driver, "driver_ref" | "first_name" | "last_name">,
  driverB: Pick<Driver, "driver_ref" | "first_name" | "last_name">
): string {
  const slugA = getDriverSlug(driverA);
  const slugB = getDriverSlug(driverB);
  const lastA = driverA.last_name.trim().toLowerCase();
  const lastB = driverB.last_name.trim().toLowerCase();
  const byLast = lastA.localeCompare(lastB);
  // tie-break: same last name → sort by driver_ref
  const aFirst = byLast < 0 || (byLast === 0 && driverA.driver_ref.localeCompare(driverB.driver_ref) <= 0);
  return aFirst ? `${slugA}-vs-${slugB}` : `${slugB}-vs-${slugA}`;
}

/**
 * Returns the hex color for a constructor ref.
 * Looks up the static CONSTRUCTOR_COLORS map — authoritative values come from
 * the `constructors.color_hex` DB column; this is a client-side fallback.
 *
 * @example getTeamColor("red_bull") → "#3671C6"
 * @example getTeamColor("unknown_team") → "#ffffff"
 */
export function getTeamColor(constructorRef: string): string {
  // Inline the most common teams to avoid a circular import with sync.ts.
  // The full map lives in lib/data/sync.ts (CONSTRUCTOR_COLORS).
  const COLORS: Record<string, string> = {
    red_bull: "#3671C6",
    ferrari: "#E8002D",
    mercedes: "#27F4D2",
    mclaren: "#FF8000",
    aston_martin: "#229971",
    alpine: "#FF87BC",
    williams: "#64C4FF",
    rb: "#6692FF",
    kick_sauber: "#52E252",
    haas: "#B6BABD",
    alphatauri: "#4E7C99",
    alpha_romeo: "#C92D4B",
    renault: "#FFE900",
    lotus_f1: "#FFB800",
    force_india: "#FF80C7",
    racing_point: "#F596C8",
    toro_rosso: "#469BFF",
    sauber: "#9B0000",
    brawn: "#80FF00",
    bmw_sauber: "#6CC4F0",
    toyota: "#CC0600",
    honda: "#FFFFFF",
    jordan: "#ECEA0C",
    bar: "#C8AA00",
    jaguar: "#00594F",
    minardi: "#191919",
    prost: "#0055A4",
    arrows: "#FF7700",
    benetton: "#00A650",
    tyrrell: "#003893",
    brabham: "#006633",
    lotus: "#FFD700",
  };
  return COLORS[constructorRef] ?? "#ffffff";
}

/**
 * Formats a lap time given in milliseconds to "m:ss.mmm" string.
 * Handles edge cases: zero, negative, or non-finite values return "–".
 *
 * @example formatLapTime(83456) → "1:23.456"
 * @example formatLapTime(63100) → "1:03.100"
 * @example formatLapTime(0)     → "–"
 */
export function formatLapTime(ms: number): string {
  if (!isFinite(ms) || ms <= 0) return "–";

  const totalSeconds = Math.floor(ms / 1000);
  const milliseconds = ms % 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  const mm = String(milliseconds).padStart(3, "0");
  const ss = String(seconds).padStart(2, "0");

  return `${minutes}:${ss}.${mm}`;
}
