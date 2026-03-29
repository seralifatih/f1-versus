/**
 * Comparison computation engine.
 *
 * Takes two driver IDs and optional filters, queries Supabase for their
 * race/qualifying data, computes all stats, and returns a ComparisonResult.
 *
 * This runs at build time (via compute-comparisons.ts script) and stores
 * results in driver_comparisons.stats_json for fast page serving.
 */

import { createServiceRoleClient } from "../supabase/client";
import { buildRadarMetrics, computeOverallScore } from "./normalize";
import {
  buildComparisonSlug,
  parsePosition,
  type Driver,
  type Result,
  type Qualifying,
  type Race,
  type Circuit,
  type DriverStats,
  type TeammateRecord,
  type AllTimeTeammateRecord,
  type SeasonStats,
  type CircuitPerformance,
  type HeadToHeadRecord,
  type ComparisonResult,
  type ComparisonFilters,
} from "../data/types";

// ─── Points normalization ──────────────────────────────────────────────────
// Pre-2010 points scale: 10-8-6-5-4-3-2-1 for P1-P8
// Post-2010 points scale: 25-18-15-12-10-8-6-4-2-1 for P1-P10
// Normalize everything to post-2010 scale for cross-era comparisons.

const POST_2010_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
const PRE_2010_POINTS = [10, 8, 6, 5, 4, 3, 2, 1, 0, 0];

function normalizePoints(rawPoints: number, season: number, position: number | null): number {
  if (season >= 2010) return rawPoints;
  if (position === null || position < 1 || position > 10) return rawPoints;
  const preIdx = position - 1;
  const postIdx = position - 1;
  const prePts = PRE_2010_POINTS[preIdx] ?? 0;
  const postPts = POST_2010_POINTS[postIdx] ?? 0;
  if (prePts === 0) return rawPoints;
  // Scale: if the driver got the pre-2010 points for their position, give them post-2010 equivalent
  return Math.round((rawPoints / prePts) * postPts);
}

// ─── Database query helpers ────────────────────────────────────────────────

interface ResultRow {
  id: string;
  race_id: string;
  driver_id: string;
  constructor_id: string;
  grid: number | null;
  position: number | null;
  points: number;
  status: string | null;
  fastest_lap_time: string | null;
  fastest_lap_rank: number | null;
  race: {
    id: string;
    season: number;
    round: number;
    circuit_id: string;
    date: string;
    name: string;
    circuit: {
      id: string;
      circuit_ref: string;
      name: string;
      country: string | null;
      type: "street" | "permanent" | null;
    } | null;
    weather_conditions: {
      wet: boolean;
    } | null;
  };
}

interface QualifyingRow {
  id: string;
  race_id: string;
  driver_id: string;
  constructor_id: string;
  q1_time: string | null;
  q2_time: string | null;
  q3_time: string | null;
  position: number | null;
  race: {
    season: number;
    circuit: {
      type: "street" | "permanent" | null;
    } | null;
    weather_conditions: {
      wet: boolean;
    } | null;
  } | null;
}

interface ChampionshipResultRow {
  driver_id: string;
  points: number;
  race: {
    season: number;
  } | null;
}

async function fetchDriverResults(
  driverId: string,
  filters: ComparisonFilters
): Promise<ResultRow[]> {
  const supabase = createServiceRoleClient();

  let query = supabase
    .from("results")
    .select(
      `
      id, race_id, driver_id, constructor_id, grid, position, points,
      status, fastest_lap_time, fastest_lap_rank,
      race:races(id, season, round, circuit_id, date, name,
        circuit:circuits(id, circuit_ref, name, country, type),
        weather_conditions(wet))
    `
    )
    .eq("driver_id", driverId)
    .eq("is_sprint", false); // exclude sprint races from career stats

  if (filters.season) {
    // Filter by season via the join
    query = query.eq("race.season", filters.season);
  }

  const { data, error } = await query;
  if (error) throw error;

  let rows = (data ?? []) as unknown as ResultRow[];

  // Filter out rows where the race join returned null (can happen with RLS)
  rows = rows.filter((r) => r.race !== null);

  if (filters.season) {
    rows = rows.filter((r) => r.race.season === filters.season);
  }

  if (filters.circuitType) {
    rows = rows.filter((r) => r.race.circuit?.type === filters.circuitType);
  }

  if (filters.wetOnly) {
    rows = rows.filter((r) => r.race.weather_conditions?.wet === true);
  }

  return rows;
}

async function fetchDriverQualifying(
  driverId: string,
  filters: ComparisonFilters
): Promise<QualifyingRow[]> {
  const supabase = createServiceRoleClient();

  let query = supabase
    .from("qualifying")
    .select(
      `
      id, race_id, driver_id, constructor_id, q1_time, q2_time, q3_time, position,
      race:races(season, circuit:circuits(type), weather_conditions(wet))
    `
    )
    .eq("driver_id", driverId);

  if (filters.season) {
    query = query.eq("race.season", filters.season);
  }

  const { data, error } = await query;
  if (error) throw error;

  let rows = (data ?? []) as unknown as QualifyingRow[];

  rows = rows.filter((row) => row.race !== null);

  if (filters.season) {
    rows = rows.filter((row) => row.race?.season === filters.season);
  }

  if (filters.circuitType) {
    rows = rows.filter((row) => row.race?.circuit?.type === filters.circuitType);
  }

  if (filters.wetOnly) {
    rows = rows.filter((row) => row.race?.weather_conditions?.wet === true);
  }

  return rows;
}

// ─── Stats computation ─────────────────────────────────────────────────────

function isDNF(status: string | null): boolean {
  if (!status) return false;
  const dnfKeywords = [
    "accident",
    "collision",
    "engine",
    "gearbox",
    "hydraulics",
    "electrical",
    "suspension",
    "brake",
    "clutch",
    "transmission",
    "mechanical",
    "retired",
    "dnf",
    "disqualified",
    "withdrew",
    "power unit",
    "exhaust",
    "steering",
    "tyres",
    "wheel",
    "fire",
    "spin",
    "overheating",
    "vibration",
    "puncture",
    "damage",
  ];
  const s = status.toLowerCase();
  return dnfKeywords.some((kw) => s.includes(kw));
}

/**
 * Compute season breakdown for a driver.
 */
function computeSeasonBreakdowns(
  results: ResultRow[],
  qualifying: QualifyingRow[]
): SeasonStats[] {
  const bySeason = new Map<number, ResultRow[]>();
  const seasonByRaceId = new Map<string, number>();
  const polesBySeason = new Map<number, number>();
  for (const r of results) {
    const s = r.race.season;
    if (!bySeason.has(s)) bySeason.set(s, []);
    bySeason.get(s)!.push(r);
    seasonByRaceId.set(r.race_id, s);
  }

  for (const q of qualifying) {
    if (q.position !== 1) continue;
    const season = q.race?.season ?? seasonByRaceId.get(q.race_id);
    if (!season) continue;
    polesBySeason.set(season, (polesBySeason.get(season) ?? 0) + 1);
  }

  return Array.from(bySeason.entries())
    .sort(([a], [b]) => a - b)
    .map(([season, rows]) => {
      const points = rows.reduce((sum, r) => sum + r.points, 0);
      const normalizedPoints = rows.reduce((sum, r) => {
        return sum + normalizePoints(r.points, season, r.position);
      }, 0);
      return {
        season,
        races: rows.length,
        wins: rows.filter((r) => r.position === 1).length,
        podiums: rows.filter((r) => r.position !== null && r.position <= 3).length,
        poles: polesBySeason.get(season) ?? 0,
        points,
        normalizedPoints,
        championship_position: null,
      };
    });
}

/**
 * Compute circuit performance for a set of results.
 */
function computeCircuitPerformance(results: ResultRow[]): CircuitPerformance {
  const finishes = results.filter((r) => r.position !== null);
  const avgFinish =
    finishes.length > 0
      ? finishes.reduce((sum, r) => sum + r.position!, 0) / finishes.length
      : 0;

  return {
    races: results.length,
    wins: results.filter((r) => r.position === 1).length,
    podiums: results.filter((r) => r.position !== null && r.position <= 3).length,
    dnfs: results.filter((r) => isDNF(r.status) || r.position === null).length,
    avgFinish,
  };
}

/**
 * Compute consistency score from finish-position standard deviation.
 * Lower variance maps to a higher 0-1 score.
 */
function computeConsistencyScore(results: ResultRow[]): number {
  const finishes = results
    .map((result) => result.position)
    .filter((position): position is number => position !== null);

  if (finishes.length === 0) return 0;

  const mean = finishes.reduce((sum, position) => sum + position, 0) / finishes.length;
  const variance =
    finishes.reduce((sum, position) => sum + (position - mean) ** 2, 0) / finishes.length;
  const stdDev = Math.sqrt(variance);

  return Math.max(0, 1 - stdDev / 8);
}

async function fetchChampionshipPositions(
  driverId: string,
  seasons: number[]
): Promise<Map<number, number>> {
  if (seasons.length === 0) return new Map();

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("results")
    .select("driver_id, points, race:races!inner(season)")
    .in("race.season", seasons)
    .eq("is_sprint", false);

  if (error) throw error;

  const pointsBySeason = new Map<number, Map<string, number>>();
  for (const row of (data ?? []) as unknown as ChampionshipResultRow[]) {
    if (!row.race) continue;
    if (!pointsBySeason.has(row.race.season)) {
      pointsBySeason.set(row.race.season, new Map());
    }

    const seasonPoints = pointsBySeason.get(row.race.season)!;
    seasonPoints.set(row.driver_id, (seasonPoints.get(row.driver_id) ?? 0) + row.points);
  }

  const positions = new Map<number, number>();

  for (const [season, seasonPoints] of pointsBySeason.entries()) {
    const rankedDrivers = Array.from(seasonPoints.entries()).sort((a, b) => b[1] - a[1]);

    let currentPosition = 0;
    let previousPoints: number | null = null;

    rankedDrivers.forEach(([candidateDriverId, points], index) => {
      if (previousPoints === null || points < previousPoints) {
        currentPosition = index + 1;
        previousPoints = points;
      }

      if (candidateDriverId === driverId) {
        positions.set(season, currentPosition);
      }
    });
  }

  return positions;
}

/**
 * Compute this driver's record vs every teammate they've ever had.
 * Queries all results for all drivers who shared a constructor+race with the
 * subject driver, then builds per-teammate H2H records.
 *
 * Returns records sorted by racesCompared descending (most time together first).
 */
async function computeAllTeammateRecords(
  driverId: string,
  results: ResultRow[],
  qualifying: QualifyingRow[]
): Promise<AllTimeTeammateRecord[]> {
  const supabase = createServiceRoleClient();

  // Map race_id → this driver's result
  const myResultByRace = new Map(results.map((r) => [r.race_id, r]));
  const myQualiByRace = new Map(qualifying.map((q) => [q.race_id, q]));

  // Find all unique constructor_ids this driver has raced for
  const myConstructorIds = new Set(results.map((r) => r.constructor_id));

  if (myConstructorIds.size === 0) return [];

  // Fetch all co-drivers: results for the same races & same constructor, different driver
  const raceIds = results.map((r) => r.race_id);
  if (raceIds.length === 0) return [];

  const { data: teammateResults } = await supabase
    .from("results")
    .select(
      `race_id, driver_id, constructor_id, position,
       driver:drivers(driver_ref, first_name, last_name),
       constructor:constructors(name)`
    )
    .in("race_id", raceIds)
    .in("constructor_id", Array.from(myConstructorIds))
    .neq("driver_id", driverId)
    .eq("is_sprint", false);

  if (!teammateResults) return [];

  const { data: teammateQualifying } = await supabase
    .from("qualifying")
    .select("race_id, driver_id, constructor_id, position")
    .in("race_id", raceIds)
    .in("constructor_id", Array.from(myConstructorIds))
    .neq("driver_id", driverId);

  // Index teammate qualifying by race+driver
  type QualiKey = string;
  const qualiByRaceAndDriver = new Map<QualiKey, { position: number | null }>();
  for (const q of teammateQualifying ?? []) {
    qualiByRaceAndDriver.set(`${q.race_id}:${q.driver_id}`, { position: q.position });
  }

  // Accumulate per-teammate records
  type TeammateAccum = {
    teammateRef: string;
    teammateName: string;
    constructorNames: Set<string>;
    racesCompared: number;
    driverAheadCount: number;
    driverBehindCount: number;
    qualiAheadCount: number;
    qualiBehindCount: number;
  };

  const byTeammate = new Map<string, TeammateAccum>();

  for (const tr of teammateResults) {
    const myResult = myResultByRace.get(tr.race_id);
    if (!myResult) continue;
    // Must be same constructor
    if (myResult.constructor_id !== tr.constructor_id) continue;
    // Both must have finished (position not null)
    if (myResult.position === null || tr.position === null) continue;

    const driverData = tr.driver as unknown as { driver_ref: string; first_name: string; last_name: string } | null;
    if (!driverData) continue;

    const conData = tr.constructor as unknown as { name: string } | null;
    const conName = conData?.name ?? "";

    if (!byTeammate.has(tr.driver_id)) {
      byTeammate.set(tr.driver_id, {
        teammateRef: driverData.driver_ref,
        teammateName: `${driverData.first_name} ${driverData.last_name}`,
        constructorNames: new Set(),
        racesCompared: 0,
        driverAheadCount: 0,
        driverBehindCount: 0,
        qualiAheadCount: 0,
        qualiBehindCount: 0,
      });
    }

    const acc = byTeammate.get(tr.driver_id)!;
    acc.constructorNames.add(conName);
    acc.racesCompared++;

    if (myResult.position < tr.position) acc.driverAheadCount++;
    else if (myResult.position > tr.position) acc.driverBehindCount++;

    // Qualifying
    const myQuali = myQualiByRace.get(tr.race_id);
    const tmQuali = qualiByRaceAndDriver.get(`${tr.race_id}:${tr.driver_id}`);
    if (myQuali?.position != null && tmQuali?.position != null) {
      if (myQuali.position < tmQuali.position) acc.qualiAheadCount++;
      else if (myQuali.position > tmQuali.position) acc.qualiBehindCount++;
    }
  }

  return Array.from(byTeammate.values())
    .sort((a, b) => b.racesCompared - a.racesCompared)
    .map((acc) => ({
      teammateRef: acc.teammateRef,
      teammateName: acc.teammateName,
      constructorNames: Array.from(acc.constructorNames),
      racesCompared: acc.racesCompared,
      driverAheadCount: acc.driverAheadCount,
      driverBehindCount: acc.driverBehindCount,
      qualiAheadCount: acc.qualiAheadCount,
      qualiBehindCount: acc.qualiBehindCount,
    }));
}

/**
 * Full stats computation for one driver.
 */
function computeDriverStats(
  driver: Driver,
  results: ResultRow[],
  qualifying: QualifyingRow[]
): DriverStats {
  const finishes = results.filter((r) => r.position !== null);
  const avgFinish =
    finishes.length > 0
      ? finishes.reduce((s, r) => s + r.position!, 0) / finishes.length
      : 0;

  const gridded = results.filter((r) => r.grid !== null && r.grid > 0);
  const avgGrid =
    gridded.length > 0
      ? gridded.reduce((s, r) => s + r.grid!, 0) / gridded.length
      : 0;

  // Average positions gained from the starting grid to the finish.
  const positionChangeData = results.filter(
    (r) => r.grid !== null && r.grid > 0 && r.position !== null && r.position <= 20
  );
  const avgPositionsGained =
    positionChangeData.length > 0
      ? positionChangeData.reduce((s, r) => s + (r.grid! - r.position!), 0) /
        positionChangeData.length
      : 0;

  const totalPoints = results.reduce((s, r) => {
    return s + normalizePoints(r.points, r.race.season, r.position);
  }, 0);

  const pointsPerRace = results.length > 0 ? totalPoints / results.length : 0;

  const poles = qualifying.filter((q) => q.position === 1).length;

  const seasonBreakdown = computeSeasonBreakdowns(results, qualifying);
  const streetResults = results.filter((r) => r.race.circuit?.type === "street");
  const permanentResults = results.filter((r) => r.race.circuit?.type === "permanent");

  return {
    driverRef: driver.driver_ref,
    driverId: driver.id,
    totalRaces: results.length,
    wins: results.filter((r) => r.position === 1).length,
    poles,
    podiums: results.filter((r) => r.position !== null && r.position <= 3).length,
    dnfs: results.filter((r) => isDNF(r.status) || r.position === null).length,
    totalPoints,
    pointsPerRace,
    avgFinishPosition: avgFinish,
    avgGridPosition: avgGrid,
    avgPositionsGained,
    consistencyScore: computeConsistencyScore(results),
    fastestLaps: results.filter((r) => r.fastest_lap_rank === 1).length,
    teammateRecord: {
      racesCompared: 0,
      driverAheadCount: 0,
      driverBehindCount: 0,
      averageGapPositions: 0,
      qualiAheadCount: 0,
      qualiBehindCount: 0,
    }, // filled by computeTeammateRecord after both drivers' stats computed
    allTeammateRecords: [], // filled by computeAllTeammateRecords in computeComparison
    seasonBreakdown,
    streetCircuitRecord: computeCircuitPerformance(streetResults),
    permanentCircuitRecord: computeCircuitPerformance(permanentResults),
  };
}

/**
 * Compute teammate head-to-head record: races where both drivers drove for the
 * same constructor in the same race.
 */
function computeTeammateRecord(
  driverAId: string,
  driverBId: string,
  resultsA: ResultRow[],
  resultsB: ResultRow[],
  qualifyingA: QualifyingRow[],
  qualifyingB: QualifyingRow[]
): { recordA: TeammateRecord; recordB: TeammateRecord } {
  // Group by race_id → constructor_id
  const aByRace = new Map(resultsA.map((r) => [r.race_id, r]));
  const bByRace = new Map(resultsB.map((r) => [r.race_id, r]));
  const qaByRace = new Map(qualifyingA.map((q) => [q.race_id, q]));
  const qbByRace = new Map(qualifyingB.map((q) => [q.race_id, q]));

  let racesCompared = 0;
  let aAhead = 0;
  let bAhead = 0;
  let gapSum = 0;
  let qaAhead = 0;
  let qbAhead = 0;

  for (const [raceId, rA] of aByRace) {
    const rB = bByRace.get(raceId);
    if (!rB) continue;
    // Must be same constructor and same race
    if (rA.constructor_id !== rB.constructor_id) continue;
    if (rA.position === null || rB.position === null) continue;

    racesCompared++;
    const gap = rB.position - rA.position; // positive = A finished ahead
    gapSum += gap;
    if (gap > 0) aAhead++;
    else if (gap < 0) bAhead++;
  }

  // Qualifying teammate comparison
  for (const [raceId, qA] of qaByRace) {
    const qB = qbByRace.get(raceId);
    if (!qB) continue;
    const rA = aByRace.get(raceId);
    const rB = bByRace.get(raceId);
    if (!rA || !rB) continue;
    if (rA.constructor_id !== rB.constructor_id) continue;
    if (qA.position === null || qB.position === null) continue;

    if (qA.position < qB.position) qaAhead++;
    else if (qA.position > qB.position) qbAhead++;
  }

  const avgGap = racesCompared > 0 ? gapSum / racesCompared : 0;

  return {
    recordA: {
      racesCompared,
      driverAheadCount: aAhead,
      driverBehindCount: bAhead,
      averageGapPositions: avgGap,
      qualiAheadCount: qaAhead,
      qualiBehindCount: qbAhead,
    },
    recordB: {
      racesCompared,
      driverAheadCount: bAhead,
      driverBehindCount: aAhead,
      averageGapPositions: -avgGap,
      qualiAheadCount: qbAhead,
      qualiBehindCount: qaAhead,
    },
  };
}

/**
 * Compute head-to-head record for all races where both drivers participated.
 */
function computeHeadToHead(
  resultsA: ResultRow[],
  resultsB: ResultRow[]
): HeadToHeadRecord {
  const aByRace = new Map(resultsA.map((r) => [r.race_id, r]));
  const bByRace = new Map(resultsB.map((r) => [r.race_id, r]));

  let totalRaces = 0;
  let aWins = 0;
  let bWins = 0;
  let ties = 0;

  for (const [raceId, rA] of aByRace) {
    const rB = bByRace.get(raceId);
    if (!rB) continue;
    if (rA.position === null || rB.position === null) continue;

    totalRaces++;
    if (rA.position < rB.position) aWins++;
    else if (rB.position < rA.position) bWins++;
    else ties++;
  }

  return { totalRaces, driverAWins: aWins, driverBWins: bWins, ties };
}

/**
 * Find seasons where both drivers competed.
 */
function findSharedSeasons(resultsA: ResultRow[], resultsB: ResultRow[]): number[] {
  const seasonsA = new Set(resultsA.map((r) => r.race.season));
  const seasonsB = new Set(resultsB.map((r) => r.race.season));
  return Array.from(seasonsA)
    .filter((s) => seasonsB.has(s))
    .sort((a, b) => a - b);
}

// ─── Main entry point ──────────────────────────────────────────────────────

/**
 * Compute a full ComparisonResult for two drivers.
 *
 * @param driverAId - Supabase UUID of driver A
 * @param driverBId - Supabase UUID of driver B
 * @param filters   - Optional season / circuit-type filters
 */
export async function computeComparison(
  driverAId: string,
  driverBId: string,
  filters: ComparisonFilters = {}
): Promise<ComparisonResult> {
  const supabase = createServiceRoleClient();

  // Fetch both drivers
  const [{ data: driverAData }, { data: driverBData }] = await Promise.all([
    supabase.from("drivers").select("*").eq("id", driverAId).single(),
    supabase.from("drivers").select("*").eq("id", driverBId).single(),
  ]);

  if (!driverAData || !driverBData) {
    throw new Error(`Driver not found: ${driverAId} or ${driverBId}`);
  }

  const driverA = driverAData as Driver;
  const driverB = driverBData as Driver;

  // Fetch results and qualifying in parallel
  const [resultsA, resultsB, qualifyingA, qualifyingB] = await Promise.all([
    fetchDriverResults(driverAId, filters),
    fetchDriverResults(driverBId, filters),
    fetchDriverQualifying(driverAId, filters),
    fetchDriverQualifying(driverBId, filters),
  ]);

  // Compute stats
  const statsA = computeDriverStats(driverA, resultsA, qualifyingA);
  const statsB = computeDriverStats(driverB, resultsB, qualifyingB);

  const [championshipPositionsA, championshipPositionsB] = await Promise.all([
    fetchChampionshipPositions(
      driverAId,
      statsA.seasonBreakdown.map((season) => season.season)
    ),
    fetchChampionshipPositions(
      driverBId,
      statsB.seasonBreakdown.map((season) => season.season)
    ),
  ]);

  statsA.seasonBreakdown.forEach((season) => {
    season.championship_position = championshipPositionsA.get(season.season) ?? null;
  });
  statsB.seasonBreakdown.forEach((season) => {
    season.championship_position = championshipPositionsB.get(season.season) ?? null;
  });

  // Compute per-teammate all-time records (run in parallel)
  const [allTeammateRecordsA, allTeammateRecordsB] = await Promise.all([
    computeAllTeammateRecords(driverAId, resultsA, qualifyingA),
    computeAllTeammateRecords(driverBId, resultsB, qualifyingB),
  ]);
  statsA.allTeammateRecords = allTeammateRecordsA;
  statsB.allTeammateRecords = allTeammateRecordsB;

  // Compute teammate record
  const { recordA, recordB } = computeTeammateRecord(
    driverAId,
    driverBId,
    resultsA,
    resultsB,
    qualifyingA,
    qualifyingB
  );
  statsA.teammateRecord = recordA;
  statsB.teammateRecord = recordB;

  // Compute head-to-head and radar
  const headToHead = computeHeadToHead(resultsA, resultsB);
  const radarMetrics = buildRadarMetrics(statsA, statsB);
  const sharedSeasons = findSharedSeasons(resultsA, resultsB);

  // Canonical slug (alphabetical by driver_ref)
  const canonicalSlug = buildComparisonSlug(driverA.driver_ref, driverB.driver_ref);

  return {
    generatedAt: new Date().toISOString(),
    filters,
    driverA,
    driverB,
    statsA,
    statsB,
    headToHead,
    radarMetrics,
    sharedSeasons,
    canonicalSlug,
  };
}

/**
 * Scale a set of DriverStats into 0–10 radar metrics.
 * Convenience wrapper around buildRadarMetrics for external callers.
 *
 * @example
 *   const metrics = normalizeForRadar(statsA, statsB);
 *   const scoreA = computeOverallScore(metrics, true);
 */
export { buildRadarMetrics as normalizeForRadar, computeOverallScore };
