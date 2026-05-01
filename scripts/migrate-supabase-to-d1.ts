/**
 * scripts/migrate-supabase-to-d1.ts
 *
 * Reads every table from Supabase and writes into the local D1 SQLite file.
 * After this runs:
 *   1. wrangler d1 export f1-versus-db --local --output=f1-versus-export.sql
 *   2. wrangler d1 execute f1-versus-db --remote --file=f1-versus-export.sql
 *
 * Usage:
 *   npx tsx scripts/migrate-supabase-to-d1.ts
 *
 * Requires in .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL=...
 *   SUPABASE_SERVICE_ROLE_KEY=...
 */

import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { createClient } from "@supabase/supabase-js";
import { createScriptDB } from "../lib/db/client";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const db = createScriptDB();

function log(msg: string) { console.log(`[${new Date().toISOString()}] ${msg}`); }
function warn(msg: string) { console.warn(`[${new Date().toISOString()}] ⚠ ${msg}`); }

// Smaller pages for heavy tables (stats_json blobs), bigger for lightweight ones
const PAGE_DEFAULT = 500;
const PAGE_HEAVY = 50; // driver_comparisons, constructor_comparisons

async function fetchPage<T>(table: string, select: string, from: number, pageSize: number): Promise<T[]> {
  const MAX_RETRIES = 5;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .range(from, from + pageSize - 1);
    if (!error) return (data ?? []) as T[];
    // Schema-missing errors won't resolve with retries — bail immediately
    if (error.message.includes("schema cache") || error.message.includes("does not exist")) {
      throw new Error(`${table}: ${error.message}`);
    }
    if (attempt < MAX_RETRIES) {
      const delay = attempt * 3000;
      warn(`${table} page ${from}: ${error.message} — retrying in ${delay / 1000}s (${attempt}/${MAX_RETRIES})`);
      await new Promise((r) => setTimeout(r, delay));
    } else {
      throw new Error(`${table}: ${error.message}`);
    }
  }
  return [];
}

async function fetchAll<T>(table: string, select = "*", pageSize = PAGE_DEFAULT): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;
  while (true) {
    const page = await fetchPage<T>(table, select, from, pageSize);
    rows.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

// ─── Table migrations ──────────────────────────────────────────────────────

async function migrateDrivers() {
  log("Migrating drivers...");
  const rows = await fetchAll<{
    id: string; driver_ref: string; first_name: string; last_name: string;
    dob: string | null; nationality: string | null; headshot_url: string | null;
    created_at: string; updated_at: string;
  }>("drivers");

  const stmt = db.prepare(
    `INSERT OR REPLACE INTO drivers (id, driver_ref, first_name, last_name, dob, nationality, headshot_url, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const r of rows) {
    await stmt.bind(r.id, r.driver_ref, r.first_name, r.last_name, r.dob ?? null, r.nationality ?? null, r.headshot_url ?? null, r.created_at, r.updated_at).run();
  }
  log(`  ✓ ${rows.length} drivers`);
}

async function migrateConstructors() {
  log("Migrating constructors...");
  const rows = await fetchAll<{
    id: string; constructor_ref: string; name: string; color_hex: string;
    created_at: string; updated_at: string;
  }>("constructors");

  const stmt = db.prepare(
    `INSERT OR REPLACE INTO constructors (id, constructor_ref, name, color_hex, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  for (const r of rows) {
    await stmt.bind(r.id, r.constructor_ref, r.name, r.color_hex, r.created_at, r.updated_at).run();
  }
  log(`  ✓ ${rows.length} constructors`);
}

async function migrateCircuits() {
  log("Migrating circuits...");
  const rows = await fetchAll<{
    id: string; circuit_ref: string; name: string; country: string | null;
    lat: number | null; lng: number | null; type: string;
    created_at: string; updated_at: string;
  }>("circuits");

  const stmt = db.prepare(
    `INSERT OR REPLACE INTO circuits (id, circuit_ref, name, country, lat, lng, type, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const r of rows) {
    await stmt.bind(r.id, r.circuit_ref, r.name, r.country ?? null, r.lat ?? null, r.lng ?? null, r.type, r.created_at, r.updated_at).run();
  }
  log(`  ✓ ${rows.length} circuits`);
}

async function migrateRaces() {
  log("Migrating races...");
  const rows = await fetchAll<{
    id: string; season: number; round: number; circuit_id: string;
    date: string | null; name: string; created_at: string; updated_at: string;
  }>("races");

  const stmt = db.prepare(
    `INSERT OR REPLACE INTO races (id, season, round, circuit_id, date, name, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const r of rows) {
    await stmt.bind(r.id, r.season, r.round, r.circuit_id, r.date ?? null, r.name, r.created_at, r.updated_at).run();
  }
  log(`  ✓ ${rows.length} races`);
}

async function migrateResults() {
  log("Migrating results (this may take a while)...");
  const rows = await fetchAll<{
    id: string; race_id: string; driver_id: string; constructor_id: string;
    grid: number | null; position: number | null; points: number;
    status: string | null; fastest_lap_time: string | null; fastest_lap_rank: number | null;
    is_sprint: boolean; created_at: string; updated_at: string;
  }>("results");

  const stmt = db.prepare(
    `INSERT OR REPLACE INTO results (id, race_id, driver_id, constructor_id, grid, position, points, status, fastest_lap_time, fastest_lap_rank, is_sprint, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  let n = 0;
  for (const r of rows) {
    await stmt.bind(
      r.id, r.race_id, r.driver_id, r.constructor_id,
      r.grid ?? null, r.position ?? null, r.points,
      r.status ?? null, r.fastest_lap_time ?? null, r.fastest_lap_rank ?? null,
      r.is_sprint ? 1 : 0,
      r.created_at, r.updated_at
    ).run();
    if (++n % 10000 === 0) log(`  ... ${n}/${rows.length} results`);
  }
  log(`  ✓ ${rows.length} results`);
}

async function migrateQualifying() {
  log("Migrating qualifying...");
  const rows = await fetchAll<{
    id: string; race_id: string; driver_id: string; constructor_id: string;
    q1_time: string | null; q2_time: string | null; q3_time: string | null;
    position: number | null; created_at: string; updated_at: string;
  }>("qualifying");

  const stmt = db.prepare(
    `INSERT OR REPLACE INTO qualifying (id, race_id, driver_id, constructor_id, q1_time, q2_time, q3_time, position, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const r of rows) {
    await stmt.bind(r.id, r.race_id, r.driver_id, r.constructor_id, r.q1_time ?? null, r.q2_time ?? null, r.q3_time ?? null, r.position ?? null, r.created_at, r.updated_at).run();
  }
  log(`  ✓ ${rows.length} qualifying rows`);
}

async function migrateWeatherConditions() {
  log("Migrating weather_conditions...");
  const rows = await fetchAll<{
    id: string; race_id: string; wet: boolean; temperature: number | null;
    created_at: string; updated_at: string;
  }>("weather_conditions");

  const stmt = db.prepare(
    `INSERT OR REPLACE INTO weather_conditions (id, race_id, wet, temperature, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  for (const r of rows) {
    await stmt.bind(r.id, r.race_id, r.wet ? 1 : 0, r.temperature ?? null, r.created_at, r.updated_at).run();
  }
  log(`  ✓ ${rows.length} weather conditions`);
}

async function migrateDriverComparisons() {
  log("Migrating driver_comparisons (small pages — large blobs)...");

  // Find where we left off
  const alreadyRow = await db.prepare(`SELECT COUNT(*) AS n FROM driver_comparisons`).first<{ n: number }>();
  const alreadyDone = alreadyRow?.n ?? 0;
  if (alreadyDone > 0) log(`  Resuming from offset ${alreadyDone}`);

  const stmt = db.prepare(
    `INSERT OR REPLACE INTO driver_comparisons
       (id, driver_a_id, driver_b_id, slug, season, stats_json, computed_stats, last_computed_at, ai_summary, ai_summary_generated_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  let from = alreadyDone;
  let totalInserted = alreadyDone;

  while (true) {
    const page = await fetchPage<{
      id: string; driver_a_id: string; driver_b_id: string; slug: string;
      season: number | null; stats_json: unknown; computed_stats: unknown;
      last_computed_at: string; ai_summary: string | null;
      ai_summary_generated_at: string | null; created_at: string; updated_at: string;
    }>("driver_comparisons", "*", from, PAGE_HEAVY);

    for (const r of page) {
      await stmt.bind(
        r.id, r.driver_a_id, r.driver_b_id, r.slug, r.season ?? null,
        JSON.stringify(r.stats_json ?? {}),
        JSON.stringify(r.computed_stats ?? {}),
        r.last_computed_at,
        r.ai_summary ?? null,
        r.ai_summary_generated_at ?? null,
        r.created_at, r.updated_at
      ).run();
    }

    totalInserted += page.length;
    log(`  ... ${totalInserted} driver comparisons`);

    if (page.length < PAGE_HEAVY) break;
    from += PAGE_HEAVY;
  }

  log(`  ✓ ${totalInserted} driver comparisons`);
}

async function migrateVotes() {
  log("Migrating votes...");
  const rows = await fetchAll<{
    id: string; comparison_slug: string; driver_ref: string;
    ip_hash: string; created_at: string;
  }>("votes");

  const stmt = db.prepare(
    `INSERT OR REPLACE INTO votes (id, comparison_slug, driver_ref, ip_hash, created_at)
     VALUES (?, ?, ?, ?, ?)`
  );
  for (const r of rows) {
    await stmt.bind(r.id, r.comparison_slug, r.driver_ref, r.ip_hash, r.created_at).run();
  }
  log(`  ✓ ${rows.length} votes`);
}

async function migrateConstructorComparisons() {
  log("Migrating constructor_comparisons...");
  const rows = await fetchAll<{
    id: string; constructor_a_id: string; constructor_b_id: string;
    slug: string; stats_json: unknown; last_computed_at: string;
    created_at: string; updated_at: string;
  }>("constructor_comparisons", "*", PAGE_HEAVY);

  const stmt = db.prepare(
    `INSERT OR REPLACE INTO constructor_comparisons
       (id, constructor_a_id, constructor_b_id, slug, stats_json, last_computed_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const r of rows) {
    await stmt.bind(
      r.id, r.constructor_a_id, r.constructor_b_id, r.slug,
      r.stats_json ? JSON.stringify(r.stats_json) : null,
      r.last_computed_at, r.created_at, r.updated_at
    ).run();
  }
  log(`  ✓ ${rows.length} constructor comparisons`);
}

async function migrateConstructorStandings() {
  log("Migrating constructor_standings...");
  const rows = await fetchAll<{
    id: string; constructor_id: string; season: number; position: number;
    points: number; wins: number; created_at: string; updated_at: string;
  }>("constructor_standings");

  const stmt = db.prepare(
    `INSERT OR REPLACE INTO constructor_standings
       (id, constructor_id, season, position, points, wins, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const r of rows) {
    await stmt.bind(r.id, r.constructor_id, r.season, r.position, r.points, r.wins, r.created_at, r.updated_at).run();
  }
  log(`  ✓ ${rows.length} constructor standings`);
}

async function migrateMetricDistributions() {
  log("Migrating metric_distributions...");
  const rows = await fetchAll<{
    metric_name: string; p10: number; p50: number; p90: number; max: number;
    updated_at: string;
  }>("metric_distributions");

  if (rows.length === 0) {
    log("  (no metric distributions found — will be computed fresh)");
    return;
  }

  const stmt = db.prepare(
    `INSERT OR REPLACE INTO metric_distributions (metric_name, p10, p50, p90, max, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  for (const r of rows) {
    await stmt.bind(r.metric_name, r.p10, r.p50, r.p90, r.max, r.updated_at).run();
  }
  log(`  ✓ ${rows.length} metric distributions`);
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function skipIfPopulated(table: string, migrate: () => Promise<void>) {
  const row = await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>();
  const n = row?.n ?? 0;
  // Skip lightweight tables if already populated; always run driver_comparisons (resumable)
  if (n > 0 && table !== "driver_comparisons") {
    log(`Skipping ${table} — already has ${n} rows`);
    return;
  }
  try {
    await migrate();
  } catch (err) {
    const msg = String(err);
    if (msg.includes("schema cache") || msg.includes("does not exist") || msg.includes("fetch failed")) {
      warn(`${table} not found in Supabase — skipping`);
    } else {
      throw err;
    }
  }
}

async function main() {
  log("Supabase → D1 migration starting...");

  // Order matters: referenced tables before referencing tables
  await skipIfPopulated("drivers",                  migrateDrivers);
  await skipIfPopulated("constructors",             migrateConstructors);
  await skipIfPopulated("circuits",                 migrateCircuits);
  await skipIfPopulated("races",                    migrateRaces);
  await skipIfPopulated("results",                  migrateResults);
  await skipIfPopulated("qualifying",               migrateQualifying);
  await skipIfPopulated("weather_conditions",       migrateWeatherConditions);
  await skipIfPopulated("driver_comparisons",       migrateDriverComparisons);
  await skipIfPopulated("votes",                    migrateVotes);
  await skipIfPopulated("constructor_comparisons",  migrateConstructorComparisons);
  await skipIfPopulated("constructor_standings",    migrateConstructorStandings);
  await skipIfPopulated("metric_distributions",     migrateMetricDistributions);

  log("\n✓ Migration complete. Local D1 SQLite is populated.");
  log("\nNext steps:");
  log("  1. npx wrangler d1 export f1-versus-db --local --output=f1-versus-export.sql");
  log("  2. npx wrangler d1 execute f1-versus-db --remote --file=f1-versus-export.sql");
  log("  3. npm run build && npm run deploy");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
