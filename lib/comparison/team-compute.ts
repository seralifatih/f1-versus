/**
 * Team / Constructor stats computation engine.
 *
 * Mirrors the driver compute.ts pattern but aggregates at constructor level.
 * Reads from: results, qualifying, races, drivers, constructors tables.
 *
 * Returns TeamStats for a single constructor, and TeamComparisonResult for
 * head-to-head constructor comparisons.
 */

import { createServerClient } from "@/lib/supabase/client";
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

// ─── Points normalization (same as driver engine) ─────────────────────────

function normalizePointsForEra(points: number, season: number): number {
  if (season < 2010) return Math.round(points * 2.5);
  return points;
}

// ─── Safety helper ────────────────────────────────────────────────────────

function safe(n: number): number {
  return isFinite(n) ? n : 0;
}

// ─── DNF detector ─────────────────────────────────────────────────────────

function isDnf(status: string | null): boolean {
  if (!status) return false;
  const s = status.toLowerCase();
  return s === "retired" || s === "accident" || s === "collision" || s === "mechanical" ||
         s === "disqualified" || s === "withdrew" || s === "spun off" ||
         s.includes("dnf") || s.includes("dnq") || s.includes("retired");
}

// ─── Radar normalization (hardcoded benchmarks, team-level) ───────────────

const TEAM_BENCHMARKS = {
  winRate:     { min: 0, max: 0.6 },
  podiumRate:  { min: 0, max: 0.9 },
  poleRate:    { min: 0, max: 0.5 },
  oneTwoRate:  { min: 0, max: 0.3 },
  pointsPR:    { min: 0, max: 30  },
  reliability: { min: 0, max: 1   },
};

function normalizeTeamMetric(
  value: number,
  min: number,
  max: number,
  higherIsBetter = true
): number {
  if (max === min) return 5;
  const clamped = Math.min(max, Math.max(min, value));
  const n = ((clamped - min) / (max - min)) * 10;
  return round1(higherIsBetter ? n : 10 - n);
}

// ─── Build radar metrics ──────────────────────────────────────────────────

export function buildTeamRadarMetrics(
  statsA: TeamStats,
  statsB: TeamStats
): RadarMetric[] {
  const B = TEAM_BENCHMARKS;

  const m = (key: string, label: string, vA: number, vB: number, b: { min: number; max: number }, hib = true): RadarMetric => ({
    metric: key,
    label,
    driverA: normalizeTeamMetric(vA, b.min, b.max, hib),
    driverB: normalizeTeamMetric(vB, b.min, b.max, hib),
    higherIsBetter: hib,
  });

  const winRateA = safe(statsA.totalRaces > 0 ? statsA.wins / statsA.totalRaces : 0);
  const winRateB = safe(statsB.totalRaces > 0 ? statsB.wins / statsB.totalRaces : 0);
  const podiumRateA = safe(statsA.totalRaces > 0 ? statsA.podiums / statsA.totalRaces : 0);
  const podiumRateB = safe(statsB.totalRaces > 0 ? statsB.podiums / statsB.totalRaces : 0);
  const poleRateA = safe(statsA.totalRaces > 0 ? statsA.poles / statsA.totalRaces : 0);
  const poleRateB = safe(statsB.totalRaces > 0 ? statsB.poles / statsB.totalRaces : 0);
  const oneTwoRateA = safe(statsA.totalRaces > 0 ? statsA.oneTwos / statsA.totalRaces : 0);
  const oneTwoRateB = safe(statsB.totalRaces > 0 ? statsB.oneTwos / statsB.totalRaces : 0);
  const reliabilityA = safe(statsA.totalRaces > 0 ? 1 - (statsA.dnfs / (statsA.totalRaces * 2)) : 1);
  const reliabilityB = safe(statsB.totalRaces > 0 ? 1 - (statsB.dnfs / (statsB.totalRaces * 2)) : 1);

  return [
    m("winRate",     "Win Rate",     winRateA,            winRateB,            B.winRate),
    m("podiumRate",  "Podium Rate",  podiumRateA,         podiumRateB,         B.podiumRate),
    m("poleRate",    "Pole Rate",    poleRateA,           poleRateB,           B.poleRate),
    m("oneTwoRate",  "1-2 Finishes", oneTwoRateA,         oneTwoRateB,         B.oneTwoRate),
    m("pointsPR",    "Points/Race",  safe(statsA.pointsPerRace), safe(statsB.pointsPerRace), B.pointsPR),
    m("reliability", "Reliability",  reliabilityA,        reliabilityB,        B.reliability),
  ];
}

// ─── Core stats computation ───────────────────────────────────────────────

type ResultRow = {
  race_id: string;
  position: number | null;
  grid: number | null;
  points: number;
  status: string | null;
  is_sprint: boolean;
  races: { season: number; round: number } | null;
  drivers: { driver_ref: string; first_name: string; last_name: string } | null;
};

type QualiRow = {
  race_id: string;
  position: number | null;
};

export async function computeTeamStats(
  constructorId: string,
  constructorRef: string,
  constructorName: string,
  constructorColor: string
): Promise<TeamStats> {
  const supabase = createServerClient();

  // Fetch all race results for this constructor (non-sprint)
  const { data: rawResults } = await supabase
    .from("results")
    .select(
      `race_id, position, grid, points, status, is_sprint,
       races!inner(season, round),
       drivers(driver_ref, first_name, last_name)`
    )
    .eq("constructor_id", constructorId)
    .eq("is_sprint", false);

  // Fetch qualifying for pole count
  const { data: rawQualifying } = await supabase
    .from("qualifying")
    .select("race_id, position")
    .eq("constructor_id", constructorId);

  const results = (rawResults ?? []) as unknown as ResultRow[];
  const quali = (rawQualifying ?? []) as unknown as QualiRow[];

  // Deduplicate by race_id to count unique race appearances
  const raceSet = new Set<string>();
  for (const r of results) raceSet.add(r.race_id);
  const totalRaces = raceSet.size;

  // Group by race for 1-2 detection and season aggregation
  const byRace = new Map<string, ResultRow[]>();
  for (const r of results) {
    if (!byRace.has(r.race_id)) byRace.set(r.race_id, []);
    byRace.get(r.race_id)!.push(r);
  }

  // Poles: qualifying position 1 for any driver from this constructor
  const poleRaces = new Set<string>();
  for (const q of quali) {
    if (q.position === 1) poleRaces.add(q.race_id);
  }
  const poles = poleRaces.size;

  // Aggregate
  let wins = 0;
  let podiums = 0;
  let oneTwos = 0;
  let dnfs = 0;
  let totalPoints = 0;
  let championships = 0;

  // Per-season map
  const seasonMap = new Map<number, {
    races: Set<string>;
    wins: number; podiums: number; poles: number; oneTwos: number;
    points: number; normalizedPoints: number;
    championship_position: number | null;
    drivers: Set<string>;
  }>();

  // Driver map: driverRef → { seasons, races, wins, podiums }
  const driverMap = new Map<string, {
    ref: string; name: string;
    seasons: Set<number>; races: number; wins: number; podiums: number;
  }>();

  for (const [raceId, raceResults] of byRace) {
    const season = raceResults[0].races?.season ?? 0;
    if (!seasonMap.has(season)) {
      seasonMap.set(season, {
        races: new Set(),
        wins: 0, podiums: 0, poles: 0, oneTwos: 0,
        points: 0, normalizedPoints: 0,
        championship_position: null,
        drivers: new Set(),
      });
    }
    const s = seasonMap.get(season)!;
    s.races.add(raceId);

    // Sort results by position (nulls last)
    const sorted = [...raceResults].sort((a, b) => {
      if (a.position == null && b.position == null) return 0;
      if (a.position == null) return 1;
      if (b.position == null) return -1;
      return a.position - b.position;
    });

    // Check 1-2 finish (both P1 and P2 are from this constructor)
    const positions = sorted.map((r) => r.position).filter((p) => p != null) as number[];
    if (positions[0] === 1 && positions[1] === 2) {
      oneTwos++;
      s.oneTwos++;
    }

    // Per-result stats
    for (const r of raceResults) {
      const normPts = normalizePointsForEra(r.points, season);
      totalPoints += normPts;
      s.points += r.points;
      s.normalizedPoints += normPts;

      if (r.position === 1) { wins++; s.wins++; }
      if (r.position != null && r.position <= 3) { podiums++; s.podiums++; }
      if (isDnf(r.status)) { dnfs++; }

      // Driver tracking
      if (r.drivers) {
        const ref = r.drivers.driver_ref;
        const name = `${r.drivers.first_name} ${r.drivers.last_name}`;
        if (!driverMap.has(ref)) driverMap.set(ref, { ref, name, seasons: new Set(), races: 0, wins: 0, podiums: 0 });
        const d = driverMap.get(ref)!;
        d.seasons.add(season);
        d.races++;
        if (r.position === 1) d.wins++;
        if (r.position != null && r.position <= 3) d.podiums++;
        s.drivers.add(ref);
      }
    }

    // Pole for this race?
    if (poleRaces.has(raceId)) s.poles++;
  }

  // Fetch constructor championship positions
  const { data: champRows } = await supabase
    .from("constructor_standings")
    .select("season, position")
    .eq("constructor_id", constructorId)
    .order("season");

  const champMap = new Map<number, number>();
  for (const row of (champRows ?? []) as { season: number; position: number }[]) {
    champMap.set(row.season, row.position);
    if (row.position === 1) championships++;
  }

  // Build season breakdown
  const seasonBreakdown: TeamSeasonStats[] = Array.from(seasonMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([season, s]) => {
      const champPos = champMap.get(season) ?? null;
      return {
        season,
        races: s.races.size,
        wins: s.wins,
        podiums: s.podiums,
        poles: s.poles,
        oneTwos: s.oneTwos,
        points: s.points,
        normalizedPoints: s.normalizedPoints,
        championship_position: champPos,
        drivers: Array.from(s.drivers)
          .map((ref) => driverMap.get(ref)?.name ?? ref)
          .sort(),
      };
    });

  // Best / worst seasons by wins then points
  const seasonsWithRaces = seasonBreakdown.filter((s) => s.races >= 5);
  const bestSeason = seasonsWithRaces.length > 0
    ? [...seasonsWithRaces].sort((a, b) => b.wins - a.wins || b.points - a.points)[0]
    : null;
  const worstSeason = seasonsWithRaces.length > 0
    ? [...seasonsWithRaces].sort((a, b) => a.wins - b.wins || a.points - b.points)[0]
    : null;

  // Driver lineup (sorted by races desc)
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
  const firstSeason = seasons[0] ?? null;
  const lastSeason = seasons[seasons.length - 1] ?? null;

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
    firstSeason,
    lastSeason,
    seasonBreakdown,
    driverLineup,
    bestSeason,
    worstSeason,
  };
}

// ─── Head-to-head between two constructors ────────────────────────────────

async function computeTeamHeadToHead(
  constructorIdA: string,
  constructorIdB: string,
  statsA: TeamStats,
  statsB: TeamStats
): Promise<TeamHeadToHeadRecord> {
  const sharedSeasons = statsA.seasonBreakdown
    .filter((s) => statsB.seasonBreakdown.some((t) => t.season === s.season))
    .map((s) => s.season);

  let seasonWinsA = 0;
  let seasonWinsB = 0;
  let raceLeadsA = 0;
  let raceLeadsB = 0;

  for (const season of sharedSeasons) {
    const sA = statsA.seasonBreakdown.find((s) => s.season === season)!;
    const sB = statsB.seasonBreakdown.find((s) => s.season === season)!;
    if (sA.points > sB.points) seasonWinsA++;
    else if (sB.points > sA.points) seasonWinsB++;
  }

  // Race-level: for each shared race, who had the best finishing driver?
  const supabase = createServerClient();

  // Get race IDs for shared seasons
  const { data: races } = await supabase
    .from("races")
    .select("id, season")
    .in("season", sharedSeasons);

  if (races && races.length > 0) {
    const raceIds = races.map((r: { id: string }) => r.id);

    const { data: aResults } = await supabase
      .from("results")
      .select("race_id, position")
      .eq("constructor_id", constructorIdA)
      .in("race_id", raceIds)
      .eq("is_sprint", false)
      .not("position", "is", null);

    const { data: bResults } = await supabase
      .from("results")
      .select("race_id, position")
      .eq("constructor_id", constructorIdB)
      .in("race_id", raceIds)
      .eq("is_sprint", false)
      .not("position", "is", null);

    // Best position per race per constructor
    const bestA = new Map<string, number>();
    const bestB = new Map<string, number>();

    for (const r of (aResults ?? []) as { race_id: string; position: number }[]) {
      const cur = bestA.get(r.race_id);
      if (cur == null || r.position < cur) bestA.set(r.race_id, r.position);
    }
    for (const r of (bResults ?? []) as { race_id: string; position: number }[]) {
      const cur = bestB.get(r.race_id);
      if (cur == null || r.position < cur) bestB.set(r.race_id, r.position);
    }

    const allRaceIds = new Set([...bestA.keys(), ...bestB.keys()]);
    for (const raceId of allRaceIds) {
      const pA = bestA.get(raceId);
      const pB = bestB.get(raceId);
      if (pA != null && pB != null) {
        if (pA < pB) raceLeadsA++;
        else if (pB < pA) raceLeadsB++;
      }
    }
  }

  return {
    totalSharedSeasons: sharedSeasons.length,
    seasonWinsA,
    seasonWinsB,
    raceLeadsA,
    raceLeadsB,
  };
}

// ─── Full team comparison ─────────────────────────────────────────────────

export async function computeTeamComparison(
  refA: string,
  refB: string
): Promise<TeamComparisonResult | null> {
  const supabase = createServerClient();

  const { data: constructors } = await supabase
    .from("constructors")
    .select("id, constructor_ref, name, color_hex")
    .in("constructor_ref", [refA, refB]);

  if (!constructors || constructors.length < 2) return null;

  const conA = constructors.find((c: { constructor_ref: string }) => c.constructor_ref === refA);
  const conB = constructors.find((c: { constructor_ref: string }) => c.constructor_ref === refB);
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

// ─── Cache layer: constructor_comparisons table ───────────────────────────

export async function getOrComputeTeamComparison(
  refA: string,
  refB: string
): Promise<TeamComparisonResult | null> {
  const slug = buildTeamSlug(refA, refB);
  const supabase = createServerClient();

  // Check cache
  const { data: cached } = await supabase
    .from("constructor_comparisons")
    .select("stats_json, last_computed_at")
    .eq("slug", slug)
    .single();

  if (cached?.stats_json) {
    return cached.stats_json as TeamComparisonResult;
  }

  // Compute fresh
  const result = await computeTeamComparison(refA, refB);
  if (!result) return null;

  // Best-effort cache write (table may not exist yet — graceful degradation)
  try {
    const { data: conRows } = await supabase
      .from("constructors")
      .select("id, constructor_ref")
      .in("constructor_ref", [refA, refB]);

    if (conRows && conRows.length === 2) {
      const cA = (conRows as { id: string; constructor_ref: string }[]).find((c) => c.constructor_ref === refA);
      const cB = (conRows as { id: string; constructor_ref: string }[]).find((c) => c.constructor_ref === refB);
      if (cA && cB) {
        await supabase.from("constructor_comparisons").upsert({
          constructor_a_id: cA.id,
          constructor_b_id: cB.id,
          slug,
          stats_json: result,
          last_computed_at: new Date().toISOString(),
        }, { onConflict: "slug" });
      }
    }
  } catch {
    // Ignore cache write failures — page still renders
  }

  return result;
}
