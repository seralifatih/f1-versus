/**
 * scripts/push-to-d1.ts
 *
 * Reads from local SQLite and pushes to remote D1 via the Cloudflare D1 HTTP API.
 * Bypasses the wrangler file-size limit entirely.
 *
 * Usage:
 *   npx tsx scripts/push-to-d1.ts
 *
 * Requires:
 *   CLOUDFLARE_API_TOKEN  — in .env.local or environment
 *   CLOUDFLARE_ACCOUNT_ID — in .env.local or environment
 *   wrangler.toml         — database_id must be set
 */

import { config } from "dotenv";
config({ path: ".env.local" });
config(); // also load .env as fallback
import * as fs from "fs";
import * as path from "path";

const CF_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const CF_ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID;

if (!CF_TOKEN || !CF_ACCOUNT) {
  console.error("Missing CLOUDFLARE_API_TOKEN or CLOUDFLARE_ACCOUNT_ID");
  process.exit(1);
}

// Read database_id from wrangler.toml
const wranglerToml = fs.readFileSync(path.join(process.cwd(), "wrangler.toml"), "utf8");
const dbIdMatch = wranglerToml.match(/database_id\s*=\s*"([^"]+)"/);
if (!dbIdMatch) { console.error("Cannot find database_id in wrangler.toml"); process.exit(1); }
const DB_ID = dbIdMatch[1];

// eslint-disable-next-line
const Database = require("better-sqlite3") as typeof import("better-sqlite3");

function findSqlite(): string {
  const base = path.join(process.cwd(), ".wrangler", "state", "v3", "d1");
  function find(dir: string): string | null {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) { const f = find(path.join(dir, e.name)); if (f) return f; }
      else if (e.name.endsWith(".sqlite") && !e.name.includes("-shm") && !e.name.includes("-wal")) {
        const full = path.join(dir, e.name);
        if (fs.statSync(full).size > 1024 * 1024) return full; // >1MB = the real DB
      }
    }
    return null;
  }
  const f = find(base);
  if (!f) throw new Error("Local D1 SQLite not found");
  return f;
}

const BATCH = 5;   // rows per API call for heavy tables (stats_json blobs)
const BATCH_LIGHT = 25; // rows per API call for lightweight tables

function log(msg: string) { console.log(`[${new Date().toISOString()}] ${msg}`); }

async function d1Query(sql: string): Promise<unknown[]> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/d1/database/${DB_ID}/query`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${CF_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sql }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
  const json = await res.json() as { success: boolean; errors?: { message: string }[]; result?: { results: unknown[] }[] };
  if (!json.success) {
    throw new Error(json.errors?.map((e) => e.message).join(", ") ?? "D1 query failed");
  }
  return json.result?.[0]?.results ?? [];
}

async function remoteCount(table: string): Promise<number> {
  try {
    const rows = await d1Query(`SELECT COUNT(*) as n FROM ${table};`) as { n: number }[];
    return rows[0]?.n ?? 0;
  } catch {
    return 0;
  }
}

// Escape a value for SQL
function esc(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return isFinite(v) ? String(v) : "NULL";
  if (typeof v === "boolean") return v ? "1" : "0";
  return `'${String(v).replace(/'/g, "''")}'`;
}

async function pushTable(
  sqlite: import("better-sqlite3").Database,
  table: string,
  columns: string[],
  batchSize: number
) {
  const total = (sqlite.prepare(`SELECT COUNT(*) as n FROM ${table}`).get() as { n: number }).n;
  if (total === 0) { log(`  ${table}: 0 rows — skipping`); return; }

  // Resume from where we left off
  const already = await remoteCount(table);
  if (already >= total) { log(`  ${table}: already complete (${already} rows)`); return; }
  if (already > 0) log(`  ${table}: resuming from offset ${already} (${already}/${total} already done)`);
  else log(`  ${table}: pushing ${total} rows...`);

  let offset = already;
  let pushed = already;

  while (offset < total) {
    const rows = sqlite.prepare(`SELECT ${columns.join(", ")} FROM ${table} LIMIT ? OFFSET ?`).all(batchSize, offset) as Record<string, unknown>[];
    if (rows.length === 0) break;

    const values = rows
      .map((r) => `(${columns.map((c) => esc(r[c])).join(", ")})`)
      .join(",\n");

    const sql = `INSERT OR REPLACE INTO ${table} (${columns.join(", ")}) VALUES\n${values};`;

    let retries = 5;
    while (retries > 0) {
      try {
        await d1Query(sql);
        break;
      } catch (err) {
        retries--;
        if (retries === 0) throw err;
        const delay = (6 - retries) * 2000;
        log(`    retrying ${table} offset ${offset} in ${delay/1000}s...`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    pushed += rows.length;
    offset += batchSize;
    if (pushed % (batchSize * 20) === 0 || pushed >= total) {
      log(`    ${table}: ${pushed}/${total}`);
    }
  }

  log(`  ✓ ${table}: ${pushed} rows pushed`);
}

async function pushComparisons(sqlite: import("better-sqlite3").Database) {
  const table = "driver_comparisons";
  const total = (sqlite.prepare(`SELECT COUNT(*) as n FROM ${table}`).get() as { n: number }).n;
  const already = await remoteCount(table);
  if (already >= total) { log(`  ${table}: already complete (${already} rows)`); return; }
  if (already > 0) log(`  ${table}: resuming from offset ${already} (${total - already} remaining)`);
  else log(`  ${table}: pushing ${total} rows (1 at a time — large blobs)...`);

  let offset = already;
  let pushed = already;

  while (offset < total) {
    const row = sqlite.prepare(
      `SELECT id, driver_a_id, driver_b_id, slug, season, stats_json,
              last_computed_at, ai_summary, ai_summary_generated_at, created_at, updated_at
       FROM driver_comparisons LIMIT 1 OFFSET ?`
    ).get(offset) as Record<string, unknown> | undefined;

    if (!row) break;

    // computed_stats is a redundant alias — store empty to avoid SQLITE_TOOBIG
    const sql = `INSERT OR REPLACE INTO driver_comparisons
      (id, driver_a_id, driver_b_id, slug, season, stats_json, computed_stats,
       last_computed_at, ai_summary, ai_summary_generated_at, created_at, updated_at)
      VALUES (${esc(row.id)}, ${esc(row.driver_a_id)}, ${esc(row.driver_b_id)},
              ${esc(row.slug)}, ${esc(row.season)}, ${esc(row.stats_json)}, '{}',
              ${esc(row.last_computed_at)}, ${esc(row.ai_summary)},
              ${esc(row.ai_summary_generated_at)}, ${esc(row.created_at)}, ${esc(row.updated_at)});`;

    let retries = 10;
    while (retries > 0) {
      try {
        await d1Query(sql);
        break;
      } catch (err) {
        const msg = String(err);
        // If blob too big, store minimal stats instead
        if (msg.includes("SQLITE_TOOBIG") && retries <= 2) {
          log(`    WARNING: row ${offset} blob too large — storing minimal stats`);
          let minimal = "{}";
          try {
            const parsed = JSON.parse(row.stats_json as string) as Record<string, unknown>;
            minimal = JSON.stringify({
              statsA: { wins: (parsed.statsA as Record<string,unknown>)?.wins, poles: (parsed.statsA as Record<string,unknown>)?.poles, podiums: (parsed.statsA as Record<string,unknown>)?.podiums, totalRaces: (parsed.statsA as Record<string,unknown>)?.totalRaces },
              statsB: { wins: (parsed.statsB as Record<string,unknown>)?.wins, poles: (parsed.statsB as Record<string,unknown>)?.poles, podiums: (parsed.statsB as Record<string,unknown>)?.podiums, totalRaces: (parsed.statsB as Record<string,unknown>)?.totalRaces },
              headToHead: parsed.headToHead,
            });
          } catch { /* ignore */ }
          const fallback = `INSERT OR REPLACE INTO driver_comparisons
            (id, driver_a_id, driver_b_id, slug, season, stats_json, computed_stats,
             last_computed_at, ai_summary, ai_summary_generated_at, created_at, updated_at)
            VALUES (${esc(row.id)}, ${esc(row.driver_a_id)}, ${esc(row.driver_b_id)},
                    ${esc(row.slug)}, ${esc(row.season)}, ${esc(minimal)}, '{}',
                    ${esc(row.last_computed_at)}, NULL, NULL,
                    ${esc(row.created_at)}, ${esc(row.updated_at)});`;
          await d1Query(fallback);
          break;
        }
        retries--;
        if (retries === 0) throw err;
        // Exponential backoff: 3s, 6s, 12s, 24s, 30s, 30s, 30s...
        const delay = Math.min(3000 * Math.pow(2, 10 - retries - 1), 30000);
        log(`    retrying offset ${offset} in ${delay/1000}s (${String(err).slice(0, 60)})`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    pushed++;
    offset++;
    if (pushed % 500 === 0 || pushed >= total) {
      log(`    ${table}: ${pushed}/${total}`);
    }
  }

  log(`  ✓ ${table}: ${pushed} rows pushed`);
}

async function applySchema() {
  log("Applying schema to remote D1...");
  const schema = fs.readFileSync(path.join(process.cwd(), "db", "schema.sql"), "utf8");

  // Strip comments and split on semicolons
  const stripped = schema
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");

  const stmts = stripped
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !/^[\s\n]*$/.test(s));

  log(`  Executing ${stmts.length} schema statements...`);
  for (const stmt of stmts) {
    try {
      await d1Query(stmt + ";");
    } catch (err) {
      const msg = String(err);
      if (!msg.includes("already exists") && !msg.includes("duplicate")) throw err;
    }
  }
  log("  ✓ Schema applied");
}

async function main() {
  log("push-to-d1 starting...");
  log(`Target: account=${CF_ACCOUNT} db=${DB_ID}`);

  const sqlitePath = findSqlite();
  log(`Source: ${sqlitePath}`);
  const sqlite = new Database(sqlitePath, { readonly: true });

  await applySchema();

  // Push in FK-safe order
  await pushTable(sqlite, "drivers",      ["id","driver_ref","first_name","last_name","dob","nationality","headshot_url","created_at","updated_at"], BATCH_LIGHT);
  await pushTable(sqlite, "constructors", ["id","constructor_ref","name","color_hex","created_at","updated_at"], BATCH_LIGHT);
  await pushTable(sqlite, "circuits",     ["id","circuit_ref","name","country","lat","lng","type","created_at","updated_at"], BATCH_LIGHT);
  await pushTable(sqlite, "races",        ["id","season","round","circuit_id","date","name","created_at","updated_at"], BATCH_LIGHT);
  await pushTable(sqlite, "results",      ["id","race_id","driver_id","constructor_id","grid","position","points","status","fastest_lap_time","fastest_lap_rank","is_sprint","created_at","updated_at"], BATCH_LIGHT);
  await pushTable(sqlite, "qualifying",   ["id","race_id","driver_id","constructor_id","q1_time","q2_time","q3_time","position","created_at","updated_at"], BATCH_LIGHT);
  await pushTable(sqlite, "weather_conditions", ["id","race_id","wet","temperature","created_at","updated_at"], BATCH_LIGHT);
  await pushComparisons(sqlite);
  await pushTable(sqlite, "votes",        ["id","comparison_slug","driver_ref","ip_hash","created_at"], BATCH_LIGHT);
  await pushTable(sqlite, "metric_distributions", ["metric_name","p10","p50","p90","max","updated_at"], BATCH_LIGHT);

  log("\n✓ All data pushed to remote D1.");
  log("Next: npm run build && npm run deploy");
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
