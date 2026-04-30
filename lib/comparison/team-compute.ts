/**
 * Team / Constructor stats computation engine.
 */

import { getDB } from "@/lib/db/client";
import { getTeamColor } from "@/lib/data/types";
import type {
  Constructor,
  TeamStats,
  TeamSeasonStats,
  TeamDriverEntry,
  TeamComparisonResult,
  TeamHeadToHeadRecord,
  RadarMetric,
} from "@/lib/data/types";
import { buildTeamSlug } from "@/lib/data/types";
import { round1 } from "./normalize";

function normalizePointsForEra(points: number, season: number): number {
  if (season < 2010) return Math.round(points * 2.5);
  return points;
}

function safe(n: number): number {
  return isFinite(n) ? n : 0;
}

function isDnf(status: string | null): boolean {
  if (!status) return false;
  const s = status.toLowerCase();
  return (
    s === "retired" || s === "accident" || s === "collision" || s === "mechanical" ||
    s === "disqualified" || s === "withdrew" || s === "spun off" ||
    s.includes("dnf") || s.includes("dnq") || s.includes("retired")
  );
}

const TEAM_BENCHMARKS = {
  winRate:     { min: 0, max: 0.6 },
  podiumRate:  { min: 0, max: 0.9 },
  poleRate:    { min: 0, max: 0.5 },
  oneTwoRate:  { min: 0, max: 0.3 },
  pointsPR:    { min: 0, max: 30  },
  reliability: { min: 0, max: 1   },
};

function normalizeTeamMetric(value: number, min: number, max: number, higherIsBetter = true): number {
  if (max === min) return 5;
  const clamped = Math.min(max, Math.max(min, value));
  const n = ((clamped - min) / (max - min)) * 10;
  return round1(higherIsBetter ? n : 10 - n);
}

export function buildTeamRadarMetrics(statsA: TeamStats, statsB: TeamStats): RadarMetric[] {
  const B = TEAM_BENCHMARKS;
  const m = (key: string, label: string, vA: number, vB: number, b: { min: number; max: number }, hib = true): RadarMetric => ({
    metric: key, label,
    driverA: normalizeTeamMetric(vA, b.min, b.max, hib),
    driverB: normalizeTeamMetric(vB, b.min, b.max, hib),
    higherIsBetter: hib,
  });

  const winRateA   = safe(statsA.totalRaces > 0 ? statsA.wins    / statsA.totalRaces : 0);
  const winRateB   = safe(statsB.totalRaces > 0 ? statsB.wins    / statsB.totalRaces : 0);
  const podiumRateA = safe(statsA.totalRaces > 0 ? statsA.podiums / statsA.totalRaces : 0);
  const podiumRateB = safe(statsB.totalRaces > 0 ? statsB.podiums / statsB.totalRaces : 0);
  const poleRateA  = safe(statsA.totalRaces > 0 ? statsA.poles   / statsA.totalRaces : 0);
  const poleRateB  = safe(statsB.totalRaces > 0 ? statsB.poles   / statsB.totalRaces : 0);
  const oneTwoRateA = safe(statsA.totalRaces > 0 ? statsA.oneTwos / statsA.totalRaces : 0);
  const oneTwoRateB = safe(statsB.totalRaces > 0 ? statsB.oneTwos / statsB.totalRaces : 0);
  const relA = safe(statsA.totalRaces > 0 ? 1 - statsA.dnfs / (statsA.totalRaces * 2) : 1);
  const relB = safe(statsB.totalRaces > 0 ? 1 - statsB.dnfs / (statsB.totalRaces * 2) : 1);

  return [
    m("winRate",    "Win Rate",     winRateA,  winRateB,  B.winRate),
    m("podiumRate", "Podium Rate",  podiumRateA, podiumRateB, B.podiumRate),
    m("poleRate",   "Pole Rate",    poleRateA, poleRateB, B.poleRate),
    m("oneTwoRate", "1-2 Finishes", oneTwoRateA, oneTwoRateB, B.oneTwoRate),
    m("pointsPR",   "Points/Race",  safe(statsA.pointsPerRace), safe(statsB.pointsPerRace), B.pointsPR),
    m("reliability","Reliability",  relA, relB, B.reliability),
  ];
}

type RawResultRow = {
  race_id: string;
  position: number | null;
  grid: number | null;
  points: number;
  status: string | null;
  is_sprint: number;
  race_season: number;
  race_round: number;
  driver_ref: string | null;
  driver_first_name: string | null;
  driver_last_name: string | null;
};

type RawQualiRow = {
  race_id: string;
  position: number | null;
};

export async function computeTeamStats(
  constructorId: string,
  constructorRef: string,
  constructorName: string,
  constructorColor: string
): Promise<TeamStats> {
  const db = getDB();

  const { results: rawResults } = await db
    .prepare(
      `SELECT r.race_id, r.position, r.grid, r.points, r.status, r.is_sprint,
              rc.season AS race_season, rc.round AS race_round,
              d.driver_ref, d.first_name AS driver_first_name, d.last_name AS driver_last_name
       FROM results r
       JOIN races rc ON rc.id = r.race_id
       LEFT JOIN drivers d ON d.id = r.driver_id
       WHERE r.constructor_id = ? AND r.is_sprint = 0`
    )
    .bind(constructorId)
    .all<RawResultRow>();

  const { results: rawQualifying } = await db
    .prepare(`SELECT race_id, position FROM qualifying WHERE constructor_id = ?`)
    .bind(constructorId)
    .all<RawQualiRow>();

  const results = rawResults;
  const quali = rawQualifying;

  const raceSet = new Set<string>();
  for (const r of results) raceSet.add(r.race_id);
  const totalRaces = raceSet.size;

  const byRace = new Map<string, RawResultRow[]>();
  for (const r of results) {
    if (!byRace.has(r.race_id)) byRace.set(r.race_id, []);
    byRace.get(r.race_id)!.push(r);
  }

  const poleRaces = new Set<string>();
  for (const q of quali) {
    if (q.position === 1) poleRaces.add(q.race_id);
  }
  const poles = poleRaces.size;

  let wins = 0, podiums = 0, oneTwos = 0, dnfs = 0, totalPoints = 0, championships = 0;

  const seasonMap = new Map<number, {
    races: Set<string>;
    wins: number; podiums: number; poles: number; oneTwos: number;
    points: number; normalizedPoints: number;
    championship_position: number | null;
    drivers: Set<string>;
  }>();

  const driverMap = new Map<string, {
    ref: string; name: string;
    seasons: Set<number>; races: number; wins: number; podiums: number;
  }>();

  for (const [raceId, raceResults] of byRace) {
    const season = raceResults[0].race_season ?? 0;
    if (!seasonMap.has(season)) {
      seasonMap.set(season, {
        races: new Set(), wins: 0, podiums: 0, poles: 0, oneTwos: 0,
        points: 0, normalizedPoints: 0, championship_position: null, drivers: new Set(),
      });
    }
    const s = seasonMap.get(season)!;
    s.races.add(raceId);

    const sorted = [...raceResults].sort((a, b) => {
      if (a.position == null && b.position == null) return 0;
      if (a.position == null) return 1;
      if (b.position == null) return -1;
      return a.position - b.position;
    });

    const positions = sorted.map((r) => r.position).filter((p): p is number => p != null);
    if (positions[0] === 1 && positions[1] === 2) { oneTwos++; s.oneTwos++; }

    for (const r of raceResults) {
      const normPts = normalizePointsForEra(r.points, season);
      totalPoints += normPts;
      s.points += r.points;
      s.normalizedPoints += normPts;

      if (r.position === 1) { wins++; s.wins++; }
      if (r.position != null && r.position <= 3) { podiums++; s.podiums++; }
      if (isDnf(r.status)) dnfs++;

      if (r.driver_ref) {
        const ref = r.driver_ref;
        const name = `${r.driver_first_name ?? ""} ${r.driver_last_name ?? ""}`.trim();
        if (!driverMap.has(ref)) driverMap.set(ref, { ref, name, seasons: new Set(), races: 0, wins: 0, podiums: 0 });
        const d = driverMap.get(ref)!;
        d.seasons.add(season);
        d.races++;
        if (r.position === 1) d.wins++;
        if (r.position != null && r.position <= 3) d.podiums++;
        s.drivers.add(ref);
      }
    }

    if (poleRaces.has(raceId)) s.poles++;
  }

  const { results: champRows } = await db
    .prepare(`SELECT season, position FROM constructor_standings WHERE constructor_id = ? ORDER BY season`)
    .bind(constructorId)
    .all<{ season: number; position: number }>();

  const champMap = new Map<number, number>();
  for (const row of champRows) {
    champMap.set(row.season, row.position);
    if (row.position === 1) championships++;
  }

  const seasonBreakdown: TeamSeasonStats[] = Array.from(seasonMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([season, s]) => ({
      season,
      races: s.races.size,
      wins: s.wins,
      podiums: s.podiums,
      poles: s.poles,
      oneTwos: s.oneTwos,
      points: s.points,
      normalizedPoints: s.normalizedPoints,
      championship_position: champMap.get(season) ?? null,
      drivers: Array.from(s.drivers).map((ref) => driverMap.get(ref)?.name ?? ref).sort(),
    }));

  const seasonsWithRaces = seasonBreakdown.filter((s) => s.races >= 5);
  const bestSeason = seasonsWithRaces.length > 0
    ? [...seasonsWithRaces].sort((a, b) => b.wins - a.wins || b.points - a.points)[0]
    : null;
  const worstSeason = seasonsWithRaces.length > 0
    ? [...seasonsWithRaces].sort((a, b) => a.wins - b.wins || a.points - b.points)[0]
    : null;

  const driverLineup: TeamDriverEntry[] = Array.from(driverMap.values())
    .sort((a, b) => b.races - a.races)
    .map((d) => ({
      driverRef: d.ref,
      name: d.name,
      seasons: Array.from(d.seasons).sort((a, b) => a - b),
      races: d.races,
      wins: d.wins,
      podiums: d.podiums,
    }));

  const seasons = Array.from(seasonMap.keys()).sort((a, b) => a - b);

  return {
    constructorId,
    constructorRef,
    name: constructorName,
    color: constructorColor,
    totalRaces,
    wins,
    poles,
    podiums,
    oneTwos,
    dnfs,
    championships,
    totalPoints: round1(totalPoints),
    pointsPerRace: round1(safe(totalRaces > 0 ? totalPoints / totalRaces : 0)),
    podiumRate: round1(safe(totalRaces > 0 ? podiums / totalRaces : 0)),
    winRate: round1(safe(totalRaces > 0 ? wins / totalRaces : 0)),
    firstSeason: seasons[0] ?? null,
    lastSeason: seasons[seasons.length - 1] ?? null,
    seasonBreakdown,
    driverLineup,
    bestSeason,
    worstSeason,
  };
}

async function computeTeamHeadToHead(
  constructorIdA: string,
  constructorIdB: string,
  statsA: TeamStats,
  statsB: TeamStats
): Promise<TeamHeadToHeadRecord> {
  const db = getDB();

  const sharedSeasons = statsA.seasonBreakdown
    .filter((s) => statsB.seasonBreakdown.some((t) => t.season === s.season))
    .map((s) => s.season);

  let seasonWinsA = 0, seasonWinsB = 0, raceLeadsA = 0, raceLeadsB = 0;

  for (const season of sharedSeasons) {
    const sA = statsA.seasonBreakdown.find((s) => s.season === season)!;
    const sB = statsB.seasonBreakdown.find((s) => s.season === season)!;
    if (sA.points > sB.points) seasonWinsA++;
    else if (sB.points > sA.points) seasonWinsB++;
  }

  if (sharedSeasons.length > 0) {
    const seasonPlaceholders = sharedSeasons.map(() => "?").join(", ");
    const { results: races } = await db
      .prepare(`SELECT id FROM races WHERE season IN (${seasonPlaceholders})`)
      .bind(...sharedSeasons)
      .all<{ id: string }>();

    if (races.length > 0) {
      const raceIds = races.map((r) => r.id);
      const raceIdPlaceholders = raceIds.map(() => "?").join(", ");

      const [{ results: aResults }, { results: bResults }] = await Promise.all([
        db
          .prepare(
            `SELECT race_id, position FROM results
             WHERE constructor_id = ? AND race_id IN (${raceIdPlaceholders})
               AND is_sprint = 0 AND position IS NOT NULL`
          )
          .bind(constructorIdA, ...raceIds)
          .all<{ race_id: string; position: number }>(),
        db
          .prepare(
            `SELECT race_id, position FROM results
             WHERE constructor_id = ? AND race_id IN (${raceIdPlaceholders})
               AND is_sprint = 0 AND position IS NOT NULL`
          )
          .bind(constructorIdB, ...raceIds)
          .all<{ race_id: string; position: number }>(),
      ]);

      const bestA = new Map<string, number>();
      const bestB = new Map<string, number>();

      for (const r of aResults) {
        const cur = bestA.get(r.race_id);
        if (cur == null || r.position < cur) bestA.set(r.race_id, r.position);
      }
      for (const r of bResults) {
        const cur = bestB.get(r.race_id);
        if (cur == null || r.position < cur) bestB.set(r.race_id, r.position);
      }

      for (const raceId of new Set([...bestA.keys(), ...bestB.keys()])) {
        const pA = bestA.get(raceId);
        const pB = bestB.get(raceId);
        if (pA != null && pB != null) {
          if (pA < pB) raceLeadsA++;
          else if (pB < pA) raceLeadsB++;
        }
      }
    }
  }

  return { totalSharedSeasons: sharedSeasons.length, seasonWinsA, seasonWinsB, raceLeadsA, raceLeadsB };
}

export async function computeTeamComparison(
  refA: string,
  refB: string
): Promise<TeamComparisonResult | null> {
  const db = getDB();

  const { results: constructors } = await db
    .prepare(
      `SELECT id, constructor_ref, name, color_hex
       FROM constructors WHERE constructor_ref IN (?, ?)`
    )
    .bind(refA, refB)
    .all<{ id: string; constructor_ref: string; name: string; color_hex: string }>();

  if (constructors.length < 2) return null;

  const conA = constructors.find((c) => c.constructor_ref === refA);
  const conB = constructors.find((c) => c.constructor_ref === refB);
  if (!conA || !conB) return null;

  const colorA = conA.color_hex ?? getTeamColor(refA);
  const colorB = conB.color_hex ?? getTeamColor(refB);

  const [statsA, statsB] = await Promise.all([
    computeTeamStats(conA.id, conA.constructor_ref, conA.name, colorA),
    computeTeamStats(conB.id, conB.constructor_ref, conB.name, colorB),
  ]);

  const headToHead = await computeTeamHeadToHead(conA.id, conB.id, statsA, statsB);
  const radarMetrics = buildTeamRadarMetrics(statsA, statsB);

  const sharedSeasons = statsA.seasonBreakdown
    .filter((s) => statsB.seasonBreakdown.some((t) => t.season === s.season))
    .map((s) => s.season)
    .sort((a, b) => a - b);

  return {
    generatedAt: new Date().toISOString(),
    constructorA: { id: conA.id, constructor_ref: conA.constructor_ref, name: conA.name, color_hex: colorA },
    constructorB: { id: conB.id, constructor_ref: conB.constructor_ref, name: conB.name, color_hex: colorB },
    statsA,
    statsB,
    headToHead,
    radarMetrics,
    sharedSeasons,
    canonicalSlug: buildTeamSlug(refA, refB),
  };
}

export async function getOrComputeTeamComparison(
  refA: string,
  refB: string
): Promise<TeamComparisonResult | null> {
  const slug = buildTeamSlug(refA, refB);
  const db = getDB();

  const cached = await db
    .prepare(`SELECT stats_json FROM constructor_comparisons WHERE slug = ?`)
    .bind(slug)
    .first<{ stats_json: string | null }>();

  if (cached?.stats_json) {
    try {
      return JSON.parse(cached.stats_json) as TeamComparisonResult;
    } catch {
      // fall through to recompute
    }
  }

  const result = await computeTeamComparison(refA, refB);
  if (!result) return null;

  try {
    const { results: conRows } = await db
      .prepare(`SELECT id, constructor_ref FROM constructors WHERE constructor_ref IN (?, ?)`)
      .bind(refA, refB)
      .all<{ id: string; constructor_ref: string }>();

    if (conRows.length === 2) {
      const cA = conRows.find((c) => c.constructor_ref === refA);
      const cB = conRows.find((c) => c.constructor_ref === refB);
      if (cA && cB) {
        const ts = new Date().toISOString();
        await db
          .prepare(
            `INSERT INTO constructor_comparisons (id, constructor_a_id, constructor_b_id, slug, stats_json, last_computed_at, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT (slug) DO UPDATE SET
               stats_json       = excluded.stats_json,
               last_computed_at = excluded.last_computed_at,
               updated_at       = excluded.updated_at`
          )
          .bind(crypto.randomUUID(), cA.id, cB.id, slug, JSON.stringify(result), ts, ts, ts)
          .run();
      }
    }
  } catch {
    // Ignore cache write failures
  }

  return result;
}
