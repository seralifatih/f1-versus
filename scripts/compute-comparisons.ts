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
import type { Driver } from "../lib/data/types";

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

// ─── Driver selection ──────────────────────────────────────────────────────

async function getDriversToCompute(): Promise<Driver[]> {
  if (driverArgs.length > 0) {
    // Specific driver refs passed via CLI
    const { data, error: err } = await supabase
      .from("drivers")
      .select("id, driver_ref, first_name, last_name, dob, nationality, headshot_url")
      .in("driver_ref", driverArgs);
    if (err) throw err;
    return (data ?? []) as Driver[];
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
    return (data ?? []) as Driver[];
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

  const drivers: Driver[] = [];
  const idChunks = chunkArray([...uniqueIds], 200);

  for (const idChunk of idChunks) {
    const { data, error: err } = await supabase
      .from("drivers")
      .select("id, driver_ref, first_name, last_name, dob, nationality, headshot_url")
      .in("id", idChunk);

    if (err) throw err;
    drivers.push(...((data ?? []) as Driver[]));
  }

  drivers.sort((a, b) => a.last_name.localeCompare(b.last_name));
  return drivers;
}

// ─── Pair generation ───────────────────────────────────────────────────────

/**
 * Generate all unique unordered pairs from an array.
 */
function generatePairs<T>(items: T[]): [T, T][] {
  const pairs: [T, T][] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
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

    const pairs = generatePairs(drivers);
    log(`Generating ${pairs.length} comparisons...`);

    let succeeded = 0;
    let failed = 0;

    for (let i = 0; i < pairs.length; i++) {
      const [driverA, driverB] = pairs[i];
      const slug = buildComparisonSlug(driverA.driver_ref, driverB.driver_ref);

      try {
        log(
          `[${i + 1}/${pairs.length}] Computing ${slug}${forceSeason ? ` (${forceSeason})` : ""}...`
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
    }

    const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    log(`\n✓ Computation complete in ${elapsed}m`);
    log(`  Succeeded: ${succeeded}`);
    if (failed > 0) log(`  Failed: ${failed}`);
  } catch (err) {
    error("Fatal error during computation", err);
    process.exit(1);
  }
}

main();
