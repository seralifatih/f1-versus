/**
 * scripts/compute-comparisons.ts
 *
 * Pre-computes comparison stats for all driver pairs and upserts them into
 * the driver_comparisons table. Runs after sync-data.ts.
 *
 * Usage:
 *   npx tsx scripts/compute-comparisons.ts
 *   npx tsx scripts/compute-comparisons.ts --driver=verstappen --driver=hamilton
 *   npx tsx scripts/compute-comparisons.ts --season=2021
 *   npx tsx scripts/compute-comparisons.ts --top=20   — only top N drivers by wins
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { computeComparison } from "../lib/comparison/compute";
import { buildComparisonSlug } from "../lib/data/types";
import type { Driver, ComparisonResult } from "../lib/data/types";
import {
  generateComparisonSummary,
  generateTemplateSummary,
} from "../lib/ai/summary";

// ─── Setup ─────────────────────────────────────────────────────────────────

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// Parse CLI args
const args = process.argv.slice(2);
const driverArgs = args.filter((a) => a.startsWith("--driver=")).map((a) => a.split("=")[1]);
const seasonArg = args.find((a) => a.startsWith("--season="));
const forceSeason = seasonArg ? parseInt(seasonArg.split("=")[1], 10) : undefined;
const topArg = args.find((a) => a.startsWith("--top="));
const topN = topArg ? parseInt(topArg.split("=")[1], 10) : null;
const maxArg = args.find((a) => a.startsWith("--max="));
const maxComparisons = maxArg ? parseInt(maxArg.split("=")[1], 10) : null;
const CHECKPOINT_EVERY = 100;

// ─── Logger ────────────────────────────────────────────────────────────────

function log(message: string): void {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

function warn(message: string): void {
  console.warn(`[${new Date().toISOString()}] ⚠ ${message}`);
}

function error(message: string, err?: unknown): void {
  console.error(`[${new Date().toISOString()}] ✖ ${message}`, err ?? "");
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

async function getExistingComparisonSlugs(season?: number): Promise<Set<string>> {
  const existing = new Set<string>();
  let from = 0;
  const pageSize = 1000;

  while (true) {
    let query = supabase
      .from("driver_comparisons")
      .select("slug")
      .range(from, from + pageSize - 1);

    query = season === undefined ? query.is("season", null) : query.eq("season", season);

    const { data, error: err } = await query;
    if (err) throw err;
    if (!data || data.length === 0) break;

    for (const row of data as { slug: string }[]) {
      existing.add(row.slug);
    }

    if (data.length < pageSize) break;
    from += pageSize;
  }

  return existing;
}

type DriverWithRange = Driver & {
  firstSeason: number;
  lastSeason: number;
  raceStarts: number;
};

async function getDriverSeasonRanges(): Promise<Map<string, { firstSeason: number; lastSeason: number; raceStarts: number }>> {
  const rangeByDriver = new Map<string, { firstSeason: number; lastSeason: number; raceStarts: number }>();
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error: err } = await supabase
      .from("results")
      .select("driver_id, races!inner(season)")
      .range(from, from + pageSize - 1);

    if (err) throw err;
    if (!data || data.length === 0) break;

    for (const row of data as { driver_id: string; races: { season: number } | { season: number }[] | null }[]) {
      const raceData = Array.isArray(row.races) ? row.races[0] : row.races;
      const season = raceData?.season;
      if (!row.driver_id || typeof season !== "number") continue;

      const existing = rangeByDriver.get(row.driver_id);
      if (!existing) {
        rangeByDriver.set(row.driver_id, { firstSeason: season, lastSeason: season, raceStarts: 1 });
      } else {
        existing.firstSeason = Math.min(existing.firstSeason, season);
        existing.lastSeason = Math.max(existing.lastSeason, season);
        existing.raceStarts++;
      }
    }

    if (data.length < pageSize) break;
    from += pageSize;
  }

  return rangeByDriver;
}

// ─── Driver selection ──────────────────────────────────────────────────────

async function getDriversToCompute(): Promise<DriverWithRange[]> {
  const rangeByDriver = await getDriverSeasonRanges();

  if (driverArgs.length > 0) {
    // Specific driver refs passed via CLI
    const { data, error: err } = await supabase
      .from("drivers")
      .select("id, driver_ref, first_name, last_name, dob, nationality, headshot_url")
      .in("driver_ref", driverArgs);
    if (err) throw err;
    return ((data ?? []) as Driver[])
      .map((driver) => {
        const range = rangeByDriver.get(driver.id);
        return range ? { ...driver, ...range } : null;
      })
      .filter((d): d is DriverWithRange => d !== null && d.raceStarts >= 20);
  }

  if (topN !== null) {
    // Top N drivers by win count
    const { data: results } = await supabase
      .from("results")
      .select("driver_id")
      .eq("position", 1);

    const winMap = new Map<string, number>();
    for (const r of results ?? []) {
      winMap.set(r.driver_id, (winMap.get(r.driver_id) ?? 0) + 1);
    }

    const topDriverIds = Array.from(winMap.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, topN)
      .map(([id]) => id);

    const { data, error: err } = await supabase
      .from("drivers")
      .select("id, driver_ref, first_name, last_name, dob, nationality, headshot_url")
      .in("id", topDriverIds);
    if (err) throw err;
    return ((data ?? []) as Driver[])
      .map((driver) => {
        const range = rangeByDriver.get(driver.id);
        return range ? { ...driver, ...range } : null;
      })
      .filter((d): d is DriverWithRange => d !== null && d.raceStarts >= 20);
  }

  // All drivers who have at least one race result
  const uniqueIds = new Set<string>();
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data: raceDriverIds, error: resultsError } = await supabase
      .from("results")
      .select("driver_id")
      .range(from, from + pageSize - 1);

    if (resultsError) throw resultsError;
    if (!raceDriverIds || raceDriverIds.length === 0) break;

    for (const row of raceDriverIds) {
      uniqueIds.add(row.driver_id);
    }

    if (raceDriverIds.length < pageSize) break;
    from += pageSize;
  }

  const drivers: DriverWithRange[] = [];
  const idChunks = chunkArray([...uniqueIds], 200);

  for (const idChunk of idChunks) {
    const { data, error: err } = await supabase
      .from("drivers")
      .select("id, driver_ref, first_name, last_name, dob, nationality, headshot_url")
      .in("id", idChunk);

    if (err) throw err;
    for (const driver of (data ?? []) as Driver[]) {
      const range = rangeByDriver.get(driver.id);
      if (!range || range.raceStarts < 20) continue;
      drivers.push({ ...driver, ...range });
    }
  }

  drivers.sort((a, b) => a.last_name.localeCompare(b.last_name));
  return drivers;
}

// ─── Pair generation ───────────────────────────────────────────────────────

/**
 * Generate all unique unordered pairs from an array.
 */
function generatePairs(items: DriverWithRange[]): [DriverWithRange, DriverWithRange][] {
  const pairs: [DriverWithRange, DriverWithRange][] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const driverA = items[i];
      const driverB = items[j];

      if (
        forceSeason &&
        (forceSeason < driverA.firstSeason ||
          forceSeason > driverA.lastSeason ||
          forceSeason < driverB.firstSeason ||
          forceSeason > driverB.lastSeason)
      ) {
        continue;
      }

      pairs.push([items[i], items[j]]);
    }
  }
  return pairs;
}

// ─── Upsert comparison ─────────────────────────────────────────────────────

async function upsertComparison(
  driverAId: string,
  driverBId: string,
  driverARef: string,
  driverBRef: string,
  season?: number
): Promise<void> {
  const result = await computeComparison(driverAId, driverBId, season ? { season } : {});

  const canonicalSlug = buildComparisonSlug(driverARef, driverBRef);

  // Canonical ordering: whichever driver_ref sorts first alphabetically is driver_a
  const aIsCanonical = driverARef.localeCompare(driverBRef) <= 0;
  const canonicalAId = aIsCanonical ? driverAId : driverBId;
  const canonicalBId = aIsCanonical ? driverBId : driverAId;

  const { error: err } = await supabase.from("driver_comparisons").upsert(
    {
      driver_a_id: canonicalAId,
      driver_b_id: canonicalBId,
      slug: canonicalSlug,
      season: season ?? null,
      stats_json: result,
      computed_stats: result,
      last_computed_at: new Date().toISOString(),
    },
    { onConflict: "driver_a_id,driver_b_id,season" }
  );

  if (err) {
    throw new Error(`Failed to upsert comparison ${canonicalSlug}: ${err.message}`);
  }

  // Generate AI summary for career comparisons only (season=null pages are the product)
  if (!season) {
    await generateAndPersistSummary(canonicalSlug, result);
  }
}

// ─── AI summary generation ─────────────────────────────────────────────────

const SUMMARY_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Check if a slug already has a fresh AI summary (< 7 days old).
 * Returns true if we should skip re-generation.
 */
async function summaryIsFresh(slug: string): Promise<boolean> {
  const { data } = await supabase
    .from("driver_comparisons")
    .select("ai_summary_generated_at")
    .eq("slug", slug)
    .is("season", null)
    .single();

  if (!data?.ai_summary_generated_at) return false;
  const age = Date.now() - new Date(data.ai_summary_generated_at as string).getTime();
  return age < SUMMARY_TTL_MS;
}

/**
 * Generate and persist an AI summary for a comparison.
 * Uses Groq when GROQ_API_KEY is set, otherwise template fallback.
 * Skips if a fresh summary already exists.
 */
async function generateAndPersistSummary(
  slug: string,
  result: ComparisonResult
): Promise<void> {
  try {
    const fresh = await summaryIsFresh(slug);
    if (fresh) {
      log(`  [AI] Skipping ${slug} — summary fresh`);
      return;
    }

    let summary: string;
    if (process.env.GROQ_API_KEY) {
      try {
        summary = await generateComparisonSummary(result);
        log(`  [AI] Generated summary for ${slug}`);
      } catch (err) {
        warn(`  [AI] Groq failed for ${slug}, using template: ${String(err)}`);
        summary = generateTemplateSummary(result);
      }
    } else {
      summary = generateTemplateSummary(result);
      log(`  [AI] Template summary for ${slug} (no GROQ_API_KEY)`);
    }

    const { error: updateErr } = await supabase
      .from("driver_comparisons")
      .update({
        ai_summary: summary,
        ai_summary_generated_at: new Date().toISOString(),
      })
      .eq("slug", slug)
      .is("season", null);

    if (updateErr) {
      warn(`  [AI] Failed to persist summary for ${slug}: ${updateErr.message}`);
    }
  } catch (err) {
    warn(`  [AI] Unexpected error for ${slug}: ${String(err)}`);
  }
}

// ─── Distribution computation ─────────────────────────────────────────────

/**
 * Compute percentile distributions for all radar metrics from the stored
 * driver_comparisons rows, then upsert into metric_distributions.
 *
 * We collect one canonical stat record per driver (deduped by driver_ref)
 * from the all-time (season=null) comparisons, then compute p10/p50/p90/max
 * for each raw metric key.
 */
async function computeAndUpsertDistributions(): Promise<void> {
  log("Computing metric distributions...");

  // Fetch all all-time comparisons — we only need the stats_json
  const allStats: Array<{
    driverRef: string;
    winRate: number;
    poleRate: number;
    podiumRate: number;
    reliability: number;      // 1 - dnfRate
    pointsPerRace: number;
    consistencyScore: number;
    avgFinishInverted: number; // 21 - avgFinishPosition
    avgPositionsGained: number;
  }> = [];

  const seenDrivers = new Set<string>();
  let from = 0;
  const pageSize = 500;

  while (true) {
    const { data, error: err } = await supabase
      .from("driver_comparisons")
      .select("stats_json")
      .is("season", null)
      .range(from, from + pageSize - 1);

    if (err) throw err;
    if (!data || data.length === 0) break;

    for (const row of data as { stats_json: { statsA?: Record<string, number>; statsB?: Record<string, number>; driverA?: { driver_ref: string }; driverB?: { driver_ref: string } } | null }[]) {
      if (!row.stats_json) continue;
      const { statsA, statsB, driverA, driverB } = row.stats_json as unknown as {
        statsA: {
          driverRef: string;
          totalRaces: number;
          wins: number;
          poles: number;
          podiums: number;
          dnfs: number;
          pointsPerRace: number;
          consistencyScore: number;
          avgFinishPosition: number;
          avgPositionsGained: number;
        };
        statsB: {
          driverRef: string;
          totalRaces: number;
          wins: number;
          poles: number;
          podiums: number;
          dnfs: number;
          pointsPerRace: number;
          consistencyScore: number;
          avgFinishPosition: number;
          avgPositionsGained: number;
        };
        driverA: { driver_ref: string };
        driverB: { driver_ref: string };
      };

      for (const [stats] of [[statsA], [statsB]] as const) {
        if (!stats || !stats.driverRef) continue;
        if (seenDrivers.has(stats.driverRef)) continue;
        if (!stats.totalRaces || stats.totalRaces < 20) continue;

        seenDrivers.add(stats.driverRef);

        const safe = (n: unknown): number => (typeof n === "number" && isFinite(n) ? n : 0);

        allStats.push({
          driverRef: stats.driverRef,
          winRate:            safe(stats.totalRaces > 0 ? stats.wins    / stats.totalRaces : 0),
          poleRate:           safe(stats.totalRaces > 0 ? stats.poles   / stats.totalRaces : 0),
          podiumRate:         safe(stats.totalRaces > 0 ? stats.podiums / stats.totalRaces : 0),
          reliability:        safe(1 - (stats.totalRaces > 0 ? stats.dnfs / stats.totalRaces : 0)),
          pointsPerRace:      safe(stats.pointsPerRace),
          consistencyScore:   safe(stats.consistencyScore),
          avgFinishInverted:  safe(21 - stats.avgFinishPosition),
          avgPositionsGained: safe(stats.avgPositionsGained),
        });
      }
    }

    if (data.length < pageSize) break;
    from += pageSize;
  }

  if (allStats.length === 0) {
    warn("No driver stats found for distribution computation — skipping");
    return;
  }

  log(`Computing distributions from ${allStats.length} driver stat records`);

  type DistributionRow = {
    metric_name: string;
    p10: number;
    p50: number;
    p90: number;
    max: number;
  };

  function computeDist(values: number[]): { p10: number; p50: number; p90: number; max: number } {
    const sorted = [...values].sort((a, b) => a - b);
    const n = sorted.length;
    const at = (pct: number): number => {
      const idx = Math.floor((pct / 100) * (n - 1));
      return sorted[Math.max(0, Math.min(n - 1, idx))];
    };
    return {
      p10: at(10),
      p50: at(50),
      p90: at(90),
      max: sorted[n - 1],
    };
  }

  const metricKeys: Array<keyof typeof allStats[0]> = [
    "winRate", "poleRate", "podiumRate", "reliability",
    "pointsPerRace", "consistencyScore", "avgFinishInverted", "avgPositionsGained",
  ];

  const rows: DistributionRow[] = metricKeys.map((key) => {
    const values = allStats.map((s) => s[key] as number);
    return { metric_name: key as string, ...computeDist(values) };
  });

  const { error: upsertErr } = await supabase
    .from("metric_distributions")
    .upsert(rows, { onConflict: "metric_name" });

  if (upsertErr) {
    throw new Error(`Failed to upsert metric distributions: ${upsertErr.message}`);
  }

  log(`✓ Upserted ${rows.length} metric distribution rows`);
  for (const r of rows) {
    log(`  ${r.metric_name}: p10=${r.p10.toFixed(3)} p50=${r.p50.toFixed(3)} p90=${r.p90.toFixed(3)} max=${r.max.toFixed(3)}`);
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  log("F1-Versus comparison computation starting...");
  log(
    `Mode: ${
      driverArgs.length > 0
        ? `specific drivers: ${driverArgs.join(", ")}`
        : topN !== null
        ? `top ${topN} drivers`
        : "all drivers"
    }${forceSeason ? ` (season ${forceSeason})` : " (all-time)"}`
  );

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const startTime = Date.now();

  try {
    log("Fetching drivers...");
    const drivers = await getDriversToCompute();
    log(`Found ${drivers.length} drivers to process`);

    const allPairs = generatePairs(drivers);
    log(`Generated ${allPairs.length} eligible comparisons before resume filtering`);

    log("Loading existing comparisons for resume support...");
    const existingSlugs = await getExistingComparisonSlugs(forceSeason);

    const pairs = allPairs.filter(([driverA, driverB]) => {
      const slug = buildComparisonSlug(driverA.driver_ref, driverB.driver_ref);
      return !existingSlugs.has(slug);
    });

    const pairsToProcess =
      maxComparisons !== null ? pairs.slice(0, maxComparisons) : pairs;

    log(
      `Generating ${pairsToProcess.length} comparisons... (${existingSlugs.size} already computed and skipped${maxComparisons !== null ? `, capped at ${maxComparisons}` : ""})`
    );

    let succeeded = 0;
    let failed = 0;

    for (let i = 0; i < pairsToProcess.length; i++) {
      const [driverA, driverB] = pairsToProcess[i];
      const slug = buildComparisonSlug(driverA.driver_ref, driverB.driver_ref);

      try {
        log(
          `[${i + 1}/${pairsToProcess.length}] Computing ${slug}${forceSeason ? ` (${forceSeason})` : ""}...`
        );
        await upsertComparison(
          driverA.id,
          driverB.id,
          driverA.driver_ref,
          driverB.driver_ref,
          forceSeason
        );
        succeeded++;
      } catch (err) {
        warn(`Failed to compute ${slug}: ${String(err)}`);
        failed++;
      }

      const processed = i + 1;
      if (processed % CHECKPOINT_EVERY === 0 || processed === pairsToProcess.length) {
        const elapsedMinutes = (Date.now() - startTime) / 1000 / 60;
        const rate = processed / Math.max(elapsedMinutes, 0.001);
        const remaining = pairsToProcess.length - processed;
        const etaMinutes = remaining / Math.max(rate, 0.001);
        log(
          `Checkpoint: ${processed}/${pairsToProcess.length} processed, ${succeeded} succeeded, ${failed} failed, elapsed ${elapsedMinutes.toFixed(1)}m, ETA ${etaMinutes.toFixed(1)}m`
        );
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    log(`\n✓ Computation complete in ${elapsed}m`);
    log(`  Succeeded: ${succeeded}`);
    if (failed > 0) log(`  Failed: ${failed}`);

    // Only compute distributions on a full all-time run (not season-scoped or
    // partial runs) — we need the full population for meaningful percentiles.
    if (!forceSeason && !maxComparisons) {
      await computeAndUpsertDistributions();
    }
  } catch (err) {
    error("Fatal error during computation", err);
    process.exit(1);
  }
}

main();
