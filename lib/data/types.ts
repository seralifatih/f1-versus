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
}

export interface ComparisonFilters {
  season?: number;
  /** Only races where both drivers were teammates */
  teammatesOnly?: boolean;
  circuitType?: "street" | "permanent";
  /** Only wet-weather races (requires weather_conditions table data) */
  wetOnly?: boolean;
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

/** Builds a comparison slug from two driver refs. Alphabetical by last name. */
export function buildComparisonSlug(
  driverARef: string,
  driverBRef: string
): string {
  const refs = [driverARef, driverBRef].sort((a, b) => a.localeCompare(b));
  return `${refs[0]}-vs-${refs[1]}`;
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
 * Always in alphabetical order by last name so each pair has exactly one URL.
 *
 * @example getComparisonSlug(driverA, driverB) → "hamilton-vs-verstappen"
 */
export function getComparisonSlug(
  driverA: Pick<Driver, "driver_ref" | "first_name" | "last_name">,
  driverB: Pick<Driver, "driver_ref" | "first_name" | "last_name">
): string {
  const slugA = getDriverSlug(driverA);
  const slugB = getDriverSlug(driverB);
  const [first, second] = [slugA, slugB].sort((a, b) => a.localeCompare(b));
  return `${first}-vs-${second}`;
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
