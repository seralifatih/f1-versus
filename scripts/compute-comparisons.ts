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
 *   npx tsx scripts/compute-comparisons.ts --top=20
 */

import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { createScriptDB } from "../lib/db/client";
import { computeComparison } from "../lib/comparison/compute";
import { buildComparisonSlug } from "../lib/data/types";
import type { Driver, ComparisonResult } from "../lib/data/types";
import {
  generateComparisonSummary,
  generateTemplateSummary,
} from "../lib/ai/summary";

// ─── Setup ─────────────────────────────────────────────────────────────────

const db = createScriptDB();

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

function newId(): string {
  return crypto.randomUUID();
}

function nowIso(): string {
  return new Date().toISOString();
}

// ─── DB helpers ────────────────────────────────────────────────────────────

async function getExistingComparisonSlugs(season?: number): Promise<Set<string>> {
  const existing = new Set<string>();
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const sql =
      season === undefined
        ? `SELECT slug FROM driver_comparisons WHERE season IS NULL LIMIT ? OFFSET ?`
        : `SELECT slug FROM driver_comparisons WHERE season = ? LIMIT ? OFFSET ?`;

    const { results } = season === undefined
      ? await db.prepare(sql).bind(pageSize, offset).all<{ slug: string }>()
      : await db.prepare(sql).bind(season, pageSize, offset).all<{ slug: string }>();

    for (const row of results) existing.add(row.slug);
    if (results.length < pageSize) break;
    offset += pageSize;
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
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const { results } = await db
      .prepare(
        `SELECT r.driver_id, rc.season
         FROM results r
         JOIN races rc ON rc.id = r.race_id
         LIMIT ? OFFSET ?`
      )
      .bind(pageSize, offset)
      .all<{ driver_id: string; season: number }>();

    for (const row of results) {
      const existing = rangeByDriver.get(row.driver_id);
      if (!existing) {
        rangeByDriver.set(row.driver_id, { firstSeason: row.season, lastSeason: row.season, raceStarts: 1 });
      } else {
        existing.firstSeason = Math.min(existing.firstSeason, row.season);
        existing.lastSeason = Math.max(existing.lastSeason, row.season);
        existing.raceStarts++;
      }
    }

    if (results.length < pageSize) break;
    offset += pageSize;
  }

  return rangeByDriver;
}

async function getDriversToCompute(): Promise<DriverWithRange[]> {
  const rangeByDriver = await getDriverSeasonRanges();

  if (driverArgs.length > 0) {
    const placeholders = driverArgs.map(() => "?").join(", ");
    const { results } = await db
      .prepare(
        `SELECT id, driver_ref, first_name, last_name, dob, nationality, headshot_url
         FROM drivers WHERE driver_ref IN (${placeholders})`
      )
      .bind(...driverArgs)
      .all<Driver>();

    return results
      .map((driver) => {
        const range = rangeByDriver.get(driver.id);
        return range ? { ...driver, ...range } : null;
      })
      .filter((d): d is DriverWithRange => d !== null && d.raceStarts >= 20);
  }

  if (topN !== null) {
    const { results: winRows } = await db
      .prepare(`SELECT driver_id, COUNT(*) as wins FROM results WHERE position = 1 GROUP BY driver_id ORDER BY wins DESC LIMIT ?`)
      .bind(topN)
      .all<{ driver_id: string; wins: number }>();

    const topIds = winRows.map((r) => r.driver_id);
    if (topIds.length === 0) return [];

    const placeholders = topIds.map(() => "?").join(", ");
    const { results } = await db
      .prepare(
        `SELECT id, driver_ref, first_name, last_name, dob, nationality, headshot_url
         FROM drivers WHERE id IN (${placeholders})`
      )
      .bind(...topIds)
      .all<Driver>();

    return results
      .map((driver) => {
        const range = rangeByDriver.get(driver.id);
        return range ? { ...driver, ...range } : null;
      })
      .filter((d): d is DriverWithRange => d !== null && d.raceStarts >= 20);
  }

  // All drivers with at least one result
  const uniqueIds = new Set<string>();
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const { results } = await db
      .prepare(`SELECT DISTINCT driver_id FROM results LIMIT ? OFFSET ?`)
      .bind(pageSize, offset)
      .all<{ driver_id: string }>();

    for (const row of results) uniqueIds.add(row.driver_id);
    if (results.length < pageSize) break;
    offset += pageSize;
  }

  const drivers: DriverWithRange[] = [];
  const idChunks = chunkArray([...uniqueIds], 200);

  for (const idChunk of idChunks) {
    const placeholders = idChunk.map(() => "?").join(", ");
    const { results } = await db
      .prepare(
        `SELECT id, driver_ref, first_name, last_name, dob, nationality, headshot_url
         FROM drivers WHERE id IN (${placeholders})`
      )
      .bind(...idChunk)
      .all<Driver>();

    for (const driver of results) {
      const range = rangeByDriver.get(driver.id);
      if (!range || range.raceStarts < 20) continue;
      drivers.push({ ...driver, ...range });
    }
  }

  drivers.sort((a, b) => a.last_name.localeCompare(b.last_name));
  return drivers;
}

// ─── Pair generation ───────────────────────────────────────────────────────

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
  const aIsCanonical = driverARef.localeCompare(driverBRef) <= 0;
  const canonicalAId = aIsCanonical ? driverAId : driverBId;
  const canonicalBId = aIsCanonical ? driverBId : driverAId;
  const statsJson = JSON.stringify(result);
  const ts = nowIso();

  await db
    .prepare(
      `INSERT INTO driver_comparisons
         (id, driver_a_id, driver_b_id, slug, season, stats_json, computed_stats, last_computed_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (driver_a_id, driver_b_id, season) DO UPDATE SET
         slug             = excluded.slug,
         stats_json       = excluded.stats_json,
         computed_stats   = excluded.computed_stats,
         last_computed_at = excluded.last_computed_at,
         updated_at       = excluded.updated_at`
    )
    .bind(
      newId(),
      canonicalAId,
      canonicalBId,
      canonicalSlug,
      season ?? null,
      statsJson,
      statsJson,
      ts,
      ts,
      ts
    )
    .run();

  if (!season) {
    await generateAndPersistSummary(canonicalSlug, result);
  }
}

// ─── AI summary generation ─────────────────────────────────────────────────

const SUMMARY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

async function summaryIsFresh(slug: string): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT ai_summary_generated_at FROM driver_comparisons
       WHERE slug = ? AND season IS NULL`
    )
    .bind(slug)
    .first<{ ai_summary_generated_at: string | null }>();

  if (!row?.ai_summary_generated_at) return false;
  const age = Date.now() - new Date(row.ai_summary_generated_at).getTime();
  return age < SUMMARY_TTL_MS;
}

async function generateAndPersistSummary(slug: string, result: ComparisonResult): Promise<void> {
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

    await db
      .prepare(
        `UPDATE driver_comparisons SET ai_summary = ?, ai_summary_generated_at = ?
         WHERE slug = ? AND season IS NULL`
      )
      .bind(summary, nowIso(), slug)
      .run();
  } catch (err) {
    warn(`  [AI] Unexpected error for ${slug}: ${String(err)}`);
  }
}

// ─── Distribution computation ─────────────────────────────────────────────

async function computeAndUpsertDistributions(): Promise<void> {
  log("Computing metric distributions...");

  type StatRow = {
    driverRef: string;
    winRate: number;
    poleRate: number;
    podiumRate: number;
    reliability: number;
    pointsPerRace: number;
    consistencyScore: number;
    avgFinishInverted: number;
    avgPositionsGained: number;
  };

  const allStats: StatRow[] = [];
  const seenDrivers = new Set<string>();
  let offset = 0;
  const pageSize = 500;

  while (true) {
    const { results } = await db
      .prepare(
        `SELECT stats_json FROM driver_comparisons WHERE season IS NULL LIMIT ? OFFSET ?`
      )
      .bind(pageSize, offset)
      .all<{ stats_json: string }>();

    for (const row of results) {
      if (!row.stats_json) continue;
      let parsed: {
        statsA: {
          driverRef: string; totalRaces: number; wins: number; poles: number;
          podiums: number; dnfs: number; pointsPerRace: number;
          consistencyScore: number; avgFinishPosition: number; avgPositionsGained: number;
        };
        statsB: {
          driverRef: string; totalRaces: number; wins: number; poles: number;
          podiums: number; dnfs: number; pointsPerRace: number;
          consistencyScore: number; avgFinishPosition: number; avgPositionsGained: number;
        };
      };
      try {
        parsed = JSON.parse(row.stats_json);
      } catch {
        continue;
      }

      for (const stats of [parsed.statsA, parsed.statsB]) {
        if (!stats?.driverRef) continue;
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

    if (results.length < pageSize) break;
    offset += pageSize;
  }

  if (allStats.length === 0) {
    warn("No driver stats found for distribution computation — skipping");
    return;
  }

  log(`Computing distributions from ${allStats.length} driver stat records`);

  function computeDist(values: number[]): { p10: number; p50: number; p90: number; max: number } {
    const sorted = [...values].sort((a, b) => a - b);
    const n = sorted.length;
    const at = (pct: number): number => {
      const idx = Math.floor((pct / 100) * (n - 1));
      return sorted[Math.max(0, Math.min(n - 1, idx))];
    };
    return { p10: at(10), p50: at(50), p90: at(90), max: sorted[n - 1] };
  }

  type MetricKey = keyof Omit<StatRow, "driverRef">;
  const metricKeys: MetricKey[] = [
    "winRate", "poleRate", "podiumRate", "reliability",
    "pointsPerRace", "consistencyScore", "avgFinishInverted", "avgPositionsGained",
  ];

  const ts = nowIso();
  for (const key of metricKeys) {
    const values = allStats.map((s) => s[key] as number);
    const dist = computeDist(values);

    await db
      .prepare(
        `INSERT INTO metric_distributions (metric_name, p10, p50, p90, max, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (metric_name) DO UPDATE SET
           p10 = excluded.p10, p50 = excluded.p50,
           p90 = excluded.p90, max = excluded.max, updated_at = excluded.updated_at`
      )
      .bind(key, dist.p10, dist.p50, dist.p90, dist.max, ts)
      .run();

    log(`  ${key}: p10=${dist.p10.toFixed(3)} p50=${dist.p50.toFixed(3)} p90=${dist.p90.toFixed(3)} max=${dist.max.toFixed(3)}`);
  }

  log(`✓ Upserted ${metricKeys.length} metric distribution rows`);
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

    const pairsToProcess = maxComparisons !== null ? pairs.slice(0, maxComparisons) : pairs;

    log(
      `Generating ${pairsToProcess.length} comparisons... (${existingSlugs.size} already computed and skipped${maxComparisons !== null ? `, capped at ${maxComparisons}` : ""})`
    );

    let succeeded = 0;
    let failed = 0;

    for (let i = 0; i < pairsToProcess.length; i++) {
      const [driverA, driverB] = pairsToProcess[i];
      const slug = buildComparisonSlug(driverA.driver_ref, driverB.driver_ref);

      try {
        log(`[${i + 1}/${pairsToProcess.length}] Computing ${slug}${forceSeason ? ` (${forceSeason})` : ""}...`);
        await upsertComparison(driverA.id, driverB.id, driverA.driver_ref, driverB.driver_ref, forceSeason);
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

    if (!forceSeason && !maxComparisons) {
      await computeAndUpsertDistributions();
    }
  } catch (err) {
    error("Fatal error during computation", err);
    process.exit(1);
  }
}

main();
