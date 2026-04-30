/**
 * Comparison computation engine.
 *
 * Takes two driver IDs and optional filters, queries D1 for their
 * race/qualifying data, computes all stats, and returns a ComparisonResult.
 */

import { getDB } from "../db/client";
import { buildRadarMetrics, computeOverallScore } from "./normalize";
import { fetchMetricDistributions } from "./distributions";
import {
  buildComparisonSlug,
  parsePosition,
  type Driver,
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

const POST_2010_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
const PRE_2010_POINTS = [10, 8, 6, 5, 4, 3, 2, 1, 0, 0];

export function normalizePointsForEra(points: number, season: number): number {
  if (season >= 2010) return points;
  return Math.round(points * 2.5);
}

function normalizePoints(rawPoints: number, season: number, position: number | null): number {
  if (season >= 2010) return rawPoints;
  if (position === null || position < 1 || position > 10) return rawPoints;
  const prePts = PRE_2010_POINTS[position - 1] ?? 0;
  const postPts = POST_2010_POINTS[position - 1] ?? 0;
  if (prePts === 0) return rawPoints;
  return Math.round((rawPoints / prePts) * postPts);
}

// ─── Row types ────────────────────────────────────────────────────────────

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
  // joined from races
  race_season: number;
  race_round: number;
  race_circuit_id: string;
  race_date: string;
  race_name: string;
  // joined from circuits
  circuit_ref: string | null;
  circuit_name: string | null;
  circuit_country: string | null;
  circuit_type: "street" | "permanent" | null;
  // joined from weather_conditions
  weather_wet: number | null; // 0/1 in SQLite
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
  // joined
  race_season: number | null;
  circuit_type: "street" | "permanent" | null;
  weather_wet: number | null;
}

// ─── Query helpers ─────────────────────────────────────────────────────────

async function fetchDriverResults(
  driverId: string,
  filters: ComparisonFilters
): Promise<ResultRow[]> {
  const db = getDB();

  let sql = `
    SELECT
      r.id, r.race_id, r.driver_id, r.constructor_id,
      r.grid, r.position, r.points, r.status,
      r.fastest_lap_time, r.fastest_lap_rank,
      rc.season  AS race_season,
      rc.round   AS race_round,
      rc.circuit_id AS race_circuit_id,
      rc.date    AS race_date,
      rc.name    AS race_name,
      c.circuit_ref, c.name AS circuit_name, c.country AS circuit_country, c.type AS circuit_type,
      w.wet AS weather_wet
    FROM results r
    JOIN races rc ON rc.id = r.race_id
    LEFT JOIN circuits c ON c.id = rc.circuit_id
    LEFT JOIN weather_conditions w ON w.race_id = rc.id
    WHERE r.driver_id = ? AND r.is_sprint = 0
  `;

  const binds: unknown[] = [driverId];

  if (filters.season) {
    sql += ` AND rc.season = ?`;
    binds.push(filters.season);
  }

  const { results } = await db.prepare(sql).bind(...binds).all<ResultRow>();

  let rows = results;

  if (filters.circuitType) {
    rows = rows.filter((r) => r.circuit_type === filters.circuitType);
  }
  if (filters.wetOnly) {
    rows = rows.filter((r) => r.weather_wet === 1);
  }

  return rows;
}

async function fetchDriverQualifying(
  driverId: string,
  filters: ComparisonFilters
): Promise<QualifyingRow[]> {
  const db = getDB();

  let sql = `
    SELECT
      q.id, q.race_id, q.driver_id, q.constructor_id,
      q.q1_time, q.q2_time, q.q3_time, q.position,
      rc.season AS race_season,
      c.type    AS circuit_type,
      w.wet     AS weather_wet
    FROM qualifying q
    JOIN races rc ON rc.id = q.race_id
    LEFT JOIN circuits c ON c.id = rc.circuit_id
    LEFT JOIN weather_conditions w ON w.race_id = rc.id
    WHERE q.driver_id = ?
  `;

  const binds: unknown[] = [driverId];

  if (filters.season) {
    sql += ` AND rc.season = ?`;
    binds.push(filters.season);
  }

  const { results } = await db.prepare(sql).bind(...binds).all<QualifyingRow>();

  let rows = results;

  if (filters.circuitType) {
    rows = rows.filter((r) => r.circuit_type === filters.circuitType);
  }
  if (filters.wetOnly) {
    rows = rows.filter((r) => r.weather_wet === 1);
  }

  return rows;
}

// ─── Stats helpers ─────────────────────────────────────────────────────────

function isDNF(status: string | null): boolean {
  if (!status) return false;
  const dnfKeywords = [
    "accident", "collision", "engine", "gearbox", "hydraulics", "electrical",
    "suspension", "brake", "clutch", "transmission", "mechanical", "retired",
    "dnf", "disqualified", "withdrew", "power unit", "exhaust", "steering",
    "tyres", "wheel", "fire", "spin", "overheating", "vibration", "puncture", "damage",
  ];
  const s = status.toLowerCase();
  return dnfKeywords.some((kw) => s.includes(kw));
}

function computeSeasonBreakdowns(
  results: ResultRow[],
  qualifying: QualifyingRow[]
): SeasonStats[] {
  const bySeason = new Map<number, ResultRow[]>();
  const seasonByRaceId = new Map<string, number>();
  const polesBySeason = new Map<number, number>();

  for (const r of results) {
    const s = r.race_season;
    if (!bySeason.has(s)) bySeason.set(s, []);
    bySeason.get(s)!.push(r);
    seasonByRaceId.set(r.race_id, s);
  }

  for (const q of qualifying) {
    if (q.position !== 1) continue;
    const season = q.race_season ?? seasonByRaceId.get(q.race_id);
    if (!season) continue;
    polesBySeason.set(season, (polesBySeason.get(season) ?? 0) + 1);
  }

  return Array.from(bySeason.entries())
    .sort(([a], [b]) => a - b)
    .map(([season, rows]) => {
      const points = rows.reduce((sum, r) => sum + r.points, 0);
      const normalizedPoints = rows.reduce(
        (sum, r) => sum + normalizePoints(r.points, season, r.position),
        0
      );
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

function computeConsistencyScore(results: ResultRow[]): number {
  const finishes = results.map((r) => r.position).filter((p): p is number => p !== null);
  if (finishes.length === 0) return 0;
  const mean = finishes.reduce((s, p) => s + p, 0) / finishes.length;
  const variance = finishes.reduce((s, p) => s + (p - mean) ** 2, 0) / finishes.length;
  return Math.max(0, 1 - Math.sqrt(variance) / 8);
}

async function fetchChampionshipPositions(
  driverId: string,
  seasons: number[]
): Promise<Map<number, number>> {
  if (seasons.length === 0) return new Map();

  const db = getDB();
  const placeholders = seasons.map(() => "?").join(", ");
  const { results } = await db
    .prepare(
      `SELECT r.driver_id, r.points, rc.season
       FROM results r
       JOIN races rc ON rc.id = r.race_id
       WHERE rc.season IN (${placeholders}) AND r.is_sprint = 0`
    )
    .bind(...seasons)
    .all<{ driver_id: string; points: number; season: number }>();

  const pointsBySeason = new Map<number, Map<string, number>>();
  for (const row of results) {
    if (!pointsBySeason.has(row.season)) pointsBySeason.set(row.season, new Map());
    const sp = pointsBySeason.get(row.season)!;
    sp.set(row.driver_id, (sp.get(row.driver_id) ?? 0) + row.points);
  }

  const positions = new Map<number, number>();
  for (const [season, seasonPoints] of pointsBySeason.entries()) {
    const ranked = Array.from(seasonPoints.entries()).sort((a, b) => b[1] - a[1]);
    let currentPosition = 0;
    let previousPoints: number | null = null;
    ranked.forEach(([candidateId, pts], index) => {
      if (previousPoints === null || pts < previousPoints) {
        currentPosition = index + 1;
        previousPoints = pts;
      }
      if (candidateId === driverId) positions.set(season, currentPosition);
    });
  }

  return positions;
}

async function computeAllTeammateRecords(
  driverId: string,
  results: ResultRow[],
  qualifying: QualifyingRow[]
): Promise<AllTimeTeammateRecord[]> {
  const db = getDB();

  const myResultByRace = new Map(results.map((r) => [r.race_id, r]));
  const myQualiByRace = new Map(qualifying.map((q) => [q.race_id, q]));
  const myConstructorIds = new Set(results.map((r) => r.constructor_id));

  if (myConstructorIds.size === 0) return [];

  const raceIds = results.map((r) => r.race_id);
  if (raceIds.length === 0) return [];

  const raceIdPlaceholders = raceIds.map(() => "?").join(", ");
  const conIdPlaceholders = [...myConstructorIds].map(() => "?").join(", ");

  const { results: teammateResults } = await db
    .prepare(
      `SELECT r.race_id, r.driver_id, r.constructor_id, r.position,
              d.driver_ref, d.first_name, d.last_name,
              c.name AS constructor_name
       FROM results r
       JOIN drivers d ON d.id = r.driver_id
       JOIN constructors c ON c.id = r.constructor_id
       WHERE r.race_id IN (${raceIdPlaceholders})
         AND r.constructor_id IN (${conIdPlaceholders})
         AND r.driver_id != ?
         AND r.is_sprint = 0`
    )
    .bind(...raceIds, ...[...myConstructorIds], driverId)
    .all<{
      race_id: string;
      driver_id: string;
      constructor_id: string;
      position: number | null;
      driver_ref: string;
      first_name: string;
      last_name: string;
      constructor_name: string;
    }>();

  const { results: teammateQualifying } = await db
    .prepare(
      `SELECT race_id, driver_id, constructor_id, position
       FROM qualifying
       WHERE race_id IN (${raceIdPlaceholders})
         AND constructor_id IN (${conIdPlaceholders})
         AND driver_id != ?`
    )
    .bind(...raceIds, ...[...myConstructorIds], driverId)
    .all<{ race_id: string; driver_id: string; constructor_id: string; position: number | null }>();

  const qualiByRaceAndDriver = new Map<string, { position: number | null }>();
  for (const q of teammateQualifying) {
    qualiByRaceAndDriver.set(`${q.race_id}:${q.driver_id}`, { position: q.position });
  }

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
    if (myResult.constructor_id !== tr.constructor_id) continue;
    if (myResult.position === null || tr.position === null) continue;

    if (!byTeammate.has(tr.driver_id)) {
      byTeammate.set(tr.driver_id, {
        teammateRef: tr.driver_ref,
        teammateName: `${tr.first_name} ${tr.last_name}`,
        constructorNames: new Set(),
        racesCompared: 0,
        driverAheadCount: 0,
        driverBehindCount: 0,
        qualiAheadCount: 0,
        qualiBehindCount: 0,
      });
    }

    const acc = byTeammate.get(tr.driver_id)!;
    acc.constructorNames.add(tr.constructor_name);
    acc.racesCompared++;

    if (myResult.position < tr.position) acc.driverAheadCount++;
    else if (myResult.position > tr.position) acc.driverBehindCount++;

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
    gridded.length > 0 ? gridded.reduce((s, r) => s + r.grid!, 0) / gridded.length : 0;

  const positionChangeData = results.filter(
    (r) => r.grid !== null && r.grid > 0 && r.position !== null && r.position <= 20
  );
  const avgPositionsGained =
    positionChangeData.length > 0
      ? positionChangeData.reduce((s, r) => s + (r.grid! - r.position!), 0) /
        positionChangeData.length
      : 0;
  const positionsGainedRate =
    positionChangeData.length > 0
      ? positionChangeData.filter((r) => r.position! < r.grid!).length /
        positionChangeData.length
      : 0;

  const totalPoints = results.reduce(
    (s, r) => s + normalizePoints(r.points, r.race_season, r.position),
    0
  );
  const pointsPerRace = results.length > 0 ? totalPoints / results.length : 0;
  const poles = qualifying.filter((q) => q.position === 1).length;
  const seasonBreakdown = computeSeasonBreakdowns(results, qualifying);
  const streetResults = results.filter((r) => r.circuit_type === "street");
  const permanentResults = results.filter((r) => r.circuit_type === "permanent");

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
    positionsGainedRate,
    consistencyScore: computeConsistencyScore(results),
    fastestLaps: results.filter((r) => r.fastest_lap_rank === 1).length,
    teammateRecord: {
      racesCompared: 0,
      driverAheadCount: 0,
      driverBehindCount: 0,
      averageGapPositions: 0,
      qualiAheadCount: 0,
      qualiBehindCount: 0,
    },
    allTeammateRecords: [],
    seasonBreakdown,
    streetCircuitRecord: computeCircuitPerformance(streetResults),
    permanentCircuitRecord: computeCircuitPerformance(permanentResults),
  };
}

function computeTeammateRecord(
  driverAId: string,
  driverBId: string,
  resultsA: ResultRow[],
  resultsB: ResultRow[],
  qualifyingA: QualifyingRow[],
  qualifyingB: QualifyingRow[]
): { recordA: TeammateRecord; recordB: TeammateRecord } {
  const aByRace = new Map(resultsA.map((r) => [r.race_id, r]));
  const bByRace = new Map(resultsB.map((r) => [r.race_id, r]));
  const qaByRace = new Map(qualifyingA.map((q) => [q.race_id, q]));
  const qbByRace = new Map(qualifyingB.map((q) => [q.race_id, q]));

  let racesCompared = 0, aAhead = 0, bAhead = 0, gapSum = 0, qaAhead = 0, qbAhead = 0;

  for (const [raceId, rA] of aByRace) {
    const rB = bByRace.get(raceId);
    if (!rB || rA.constructor_id !== rB.constructor_id) continue;
    if (rA.position === null || rB.position === null) continue;
    racesCompared++;
    const gap = rB.position - rA.position;
    gapSum += gap;
    if (gap > 0) aAhead++;
    else if (gap < 0) bAhead++;
  }

  for (const [raceId, qA] of qaByRace) {
    const qB = qbByRace.get(raceId);
    if (!qB) continue;
    const rA = aByRace.get(raceId);
    const rB = bByRace.get(raceId);
    if (!rA || !rB || rA.constructor_id !== rB.constructor_id) continue;
    if (qA.position === null || qB.position === null) continue;
    if (qA.position < qB.position) qaAhead++;
    else if (qA.position > qB.position) qbAhead++;
  }

  const avgGap = racesCompared > 0 ? gapSum / racesCompared : 0;

  return {
    recordA: { racesCompared, driverAheadCount: aAhead, driverBehindCount: bAhead, averageGapPositions: avgGap, qualiAheadCount: qaAhead, qualiBehindCount: qbAhead },
    recordB: { racesCompared, driverAheadCount: bAhead, driverBehindCount: aAhead, averageGapPositions: -avgGap, qualiAheadCount: qbAhead, qualiBehindCount: qaAhead },
  };
}

function computeHeadToHead(resultsA: ResultRow[], resultsB: ResultRow[]): HeadToHeadRecord {
  const aByRace = new Map(resultsA.map((r) => [r.race_id, r]));
  const bByRace = new Map(resultsB.map((r) => [r.race_id, r]));

  let totalRaces = 0, aWins = 0, bWins = 0, ties = 0;

  for (const [raceId, rA] of aByRace) {
    const rB = bByRace.get(raceId);
    if (!rB || rA.position === null || rB.position === null) continue;
    totalRaces++;
    if (rA.position < rB.position) aWins++;
    else if (rB.position < rA.position) bWins++;
    else ties++;
  }

  return { totalRaces, driverAWins: aWins, driverBWins: bWins, ties };
}

function findSharedSeasons(resultsA: ResultRow[], resultsB: ResultRow[]): number[] {
  const seasonsA = new Set(resultsA.map((r) => r.race_season));
  const seasonsB = new Set(resultsB.map((r) => r.race_season));
  return Array.from(seasonsA)
    .filter((s) => seasonsB.has(s))
    .sort((a, b) => a - b);
}

// ─── Main entry point ──────────────────────────────────────────────────────

export async function computeComparison(
  driverAId: string,
  driverBId: string,
  filters: ComparisonFilters = {}
): Promise<ComparisonResult> {
  const db = getDB();

  const [driverARow, driverBRow] = await Promise.all([
    db.prepare(`SELECT * FROM drivers WHERE id = ?`).bind(driverAId).first<Driver>(),
    db.prepare(`SELECT * FROM drivers WHERE id = ?`).bind(driverBId).first<Driver>(),
  ]);

  if (!driverARow || !driverBRow) {
    throw new Error(`Driver not found: ${driverAId} or ${driverBId}`);
  }

  const driverA = driverARow;
  const driverB = driverBRow;

  const [resultsA, resultsB, qualifyingA, qualifyingB] = await Promise.all([
    fetchDriverResults(driverAId, filters),
    fetchDriverResults(driverBId, filters),
    fetchDriverQualifying(driverAId, filters),
    fetchDriverQualifying(driverBId, filters),
  ]);

  const statsA = computeDriverStats(driverA, resultsA, qualifyingA);
  const statsB = computeDriverStats(driverB, resultsB, qualifyingB);

  const [championshipPositionsA, championshipPositionsB] = await Promise.all([
    fetchChampionshipPositions(driverAId, statsA.seasonBreakdown.map((s) => s.season)),
    fetchChampionshipPositions(driverBId, statsB.seasonBreakdown.map((s) => s.season)),
  ]);

  statsA.seasonBreakdown.forEach((s) => {
    s.championship_position = championshipPositionsA.get(s.season) ?? null;
  });
  statsB.seasonBreakdown.forEach((s) => {
    s.championship_position = championshipPositionsB.get(s.season) ?? null;
  });

  const [allTeammateRecordsA, allTeammateRecordsB] = await Promise.all([
    computeAllTeammateRecords(driverAId, resultsA, qualifyingA),
    computeAllTeammateRecords(driverBId, resultsB, qualifyingB),
  ]);
  statsA.allTeammateRecords = allTeammateRecordsA;
  statsB.allTeammateRecords = allTeammateRecordsB;

  const { recordA, recordB } = computeTeammateRecord(
    driverAId, driverBId, resultsA, resultsB, qualifyingA, qualifyingB
  );
  statsA.teammateRecord = recordA;
  statsB.teammateRecord = recordB;

  const headToHead = computeHeadToHead(resultsA, resultsB);
  const distributions = await fetchMetricDistributions();
  const radarMetrics = buildRadarMetrics(statsA, statsB, distributions.size > 0 ? distributions : undefined);
  const sharedSeasons = findSharedSeasons(resultsA, resultsB);
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
    cross_era: sharedSeasons.length === 0,
  };
}

export { buildRadarMetrics as normalizeForRadar, computeOverallScore };
