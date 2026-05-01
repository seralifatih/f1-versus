/**
 * scripts/sync-data.ts
 *
 * CLI entrypoint for syncing F1 data from Jolpica API into D1.
 *
 * Usage:
 *   npx tsx scripts/sync-data.ts              — full sync (all seasons)
 *   npx tsx scripts/sync-data.ts --incremental — current season only
 *   npx tsx scripts/sync-data.ts --season=2023 — specific season
 */

import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { createScriptDB } from "../lib/db/client";
import {
  fetchSeasons,
  fetchRacesByYear,
  fetchResultsByRace,
  fetchQualifyingByRace,
  fetchSprintByRace,
  fetchDrivers,
  fetchDriversBySeason,
  fetchConstructors,
  fetchConstructorsBySeason,
  CONSTRUCTOR_COLORS,
} from "../lib/data/sync";
import {
  parsePosition,
  type JolpicaDriver,
  type JolpicaConstructor,
  type JolpicaRace,
  type JolpicaResult,
  type JolpicaQualifyingResult,
} from "../lib/data/types";

// ─── Setup ─────────────────────────────────────────────────────────────────

const db = createScriptDB();

// Parse CLI args
const args = process.argv.slice(2);
const isIncremental = args.includes("--incremental");
const seasonArg = args.find((a) => a.startsWith("--season="));
const forceSeason = seasonArg ? parseInt(seasonArg.split("=")[1], 10) : null;
const failedEndpoints: string[] = [];

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

function now(): string {
  return new Date().toISOString();
}

function newId(): string {
  return crypto.randomUUID();
}

// ─── Upsert helpers ────────────────────────────────────────────────────────

async function upsertDriver(driver: JolpicaDriver): Promise<void> {
  try {
    await db
      .prepare(
        `INSERT INTO drivers (id, driver_ref, first_name, last_name, dob, nationality, headshot_url, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (driver_ref) DO UPDATE SET
           first_name   = excluded.first_name,
           last_name    = excluded.last_name,
           dob          = excluded.dob,
           nationality  = excluded.nationality,
           updated_at   = excluded.updated_at`
      )
      .bind(
        newId(),
        driver.driverId,
        driver.givenName,
        driver.familyName,
        driver.dateOfBirth ?? null,
        driver.nationality ?? null,
        null,
        now(),
        now()
      )
      .run();
  } catch (err) {
    warn(`Failed to upsert driver ${driver.driverId}: ${String(err)}`);
  }
}

async function upsertConstructor(constructor: JolpicaConstructor): Promise<void> {
  const colorHex = CONSTRUCTOR_COLORS[constructor.constructorId] ?? null;
  try {
    if (colorHex) {
      await db
        .prepare(
          `INSERT INTO constructors (id, constructor_ref, name, color_hex, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT (constructor_ref) DO UPDATE SET
             name       = excluded.name,
             color_hex  = excluded.color_hex,
             updated_at = excluded.updated_at`
        )
        .bind(newId(), constructor.constructorId, constructor.name, colorHex, now(), now())
        .run();
    } else {
      await db
        .prepare(
          `INSERT INTO constructors (id, constructor_ref, name, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT (constructor_ref) DO UPDATE SET
             name       = excluded.name,
             updated_at = excluded.updated_at`
        )
        .bind(newId(), constructor.constructorId, constructor.name, now(), now())
        .run();
    }
  } catch (err) {
    warn(`Failed to upsert constructor ${constructor.constructorId}: ${String(err)}`);
  }
}

async function upsertCircuit(race: JolpicaRace): Promise<void> {
  const c = race.Circuit;
  try {
    await db
      .prepare(
        `INSERT INTO circuits (id, circuit_ref, name, country, lat, lng, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (circuit_ref) DO UPDATE SET
           name       = excluded.name,
           country    = excluded.country,
           lat        = excluded.lat,
           lng        = excluded.lng,
           updated_at = excluded.updated_at`
      )
      .bind(
        newId(),
        c.circuitId,
        c.circuitName,
        c.Location.country,
        parseFloat(c.Location.lat),
        parseFloat(c.Location.long),
        now(),
        now()
      )
      .run();
  } catch (err) {
    warn(`Failed to upsert circuit ${c.circuitId}: ${String(err)}`);
  }
}

async function getCircuitId(circuitRef: string): Promise<string | null> {
  const row = await db
    .prepare(`SELECT id FROM circuits WHERE circuit_ref = ?`)
    .bind(circuitRef)
    .first<{ id: string }>();
  return row?.id ?? null;
}

async function getDriverId(driverRef: string): Promise<string | null> {
  const row = await db
    .prepare(`SELECT id FROM drivers WHERE driver_ref = ?`)
    .bind(driverRef)
    .first<{ id: string }>();
  return row?.id ?? null;
}

async function getConstructorId(constructorRef: string): Promise<string | null> {
  const row = await db
    .prepare(`SELECT id FROM constructors WHERE constructor_ref = ?`)
    .bind(constructorRef)
    .first<{ id: string }>();
  return row?.id ?? null;
}

async function upsertRace(race: JolpicaRace, circuitId: string): Promise<string | null> {
  const season = parseInt(race.season, 10);
  const round = parseInt(race.round, 10);
  const id = newId();
  try {
    await db
      .prepare(
        `INSERT INTO races (id, season, round, circuit_id, date, name, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (season, round) DO UPDATE SET
           circuit_id = excluded.circuit_id,
           date       = excluded.date,
           name       = excluded.name,
           updated_at = excluded.updated_at`
      )
      .bind(id, season, round, circuitId, race.date, race.raceName, now(), now())
      .run();

    const row = await db
      .prepare(`SELECT id FROM races WHERE season = ? AND round = ?`)
      .bind(season, round)
      .first<{ id: string }>();
    return row?.id ?? null;
  } catch (err) {
    warn(`Failed to upsert race ${race.season}/${race.round}: ${String(err)}`);
    return null;
  }
}

async function upsertResult(
  raceId: string,
  result: JolpicaResult,
  isSprint = false
): Promise<void> {
  const driverId = await getDriverId(result.Driver.driverId);
  const constructorId = await getConstructorId(result.Constructor.constructorId);

  if (!driverId || !constructorId) {
    warn(`Skipping result for ${result.Driver.driverId} — missing driver or constructor ID`);
    return;
  }

  const position = parsePosition(result.positionText);
  const grid = parseInt(result.grid, 10);

  try {
    await db
      .prepare(
        `INSERT INTO results (id, race_id, driver_id, constructor_id, grid, position, points, status,
           fastest_lap_time, fastest_lap_rank, is_sprint, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (race_id, driver_id, is_sprint) DO UPDATE SET
           constructor_id   = excluded.constructor_id,
           grid             = excluded.grid,
           position         = excluded.position,
           points           = excluded.points,
           status           = excluded.status,
           fastest_lap_time = excluded.fastest_lap_time,
           fastest_lap_rank = excluded.fastest_lap_rank,
           updated_at       = excluded.updated_at`
      )
      .bind(
        newId(),
        raceId,
        driverId,
        constructorId,
        isNaN(grid) ? null : grid,
        position,
        parseFloat(result.points) || 0,
        result.status ?? null,
        result.FastestLap?.Time?.time ?? null,
        result.FastestLap?.rank ? parseInt(result.FastestLap.rank, 10) : null,
        isSprint ? 1 : 0,
        now(),
        now()
      )
      .run();
  } catch (err) {
    warn(`Failed to upsert result for ${result.Driver.driverId} in race ${raceId}: ${String(err)}`);
  }
}

async function upsertQualifying(
  raceId: string,
  result: JolpicaQualifyingResult
): Promise<void> {
  const driverId = await getDriverId(result.Driver.driverId);
  const constructorId = await getConstructorId(result.Constructor.constructorId);

  if (!driverId || !constructorId) {
    warn(`Skipping qualifying for ${result.Driver.driverId} — missing driver or constructor ID`);
    return;
  }

  const position = parsePosition(result.position);

  try {
    await db
      .prepare(
        `INSERT INTO qualifying (id, race_id, driver_id, constructor_id, q1_time, q2_time, q3_time, position, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (race_id, driver_id) DO UPDATE SET
           constructor_id = excluded.constructor_id,
           q1_time        = excluded.q1_time,
           q2_time        = excluded.q2_time,
           q3_time        = excluded.q3_time,
           position       = excluded.position,
           updated_at     = excluded.updated_at`
      )
      .bind(
        newId(),
        raceId,
        driverId,
        constructorId,
        result.Q1 ?? null,
        result.Q2 ?? null,
        result.Q3 ?? null,
        position,
        now(),
        now()
      )
      .run();
  } catch (err) {
    warn(`Failed to upsert qualifying for ${result.Driver.driverId} in race ${raceId}: ${String(err)}`);
  }
}

// ─── Sync functions ────────────────────────────────────────────────────────

async function syncDriversAndConstructors(season?: number): Promise<void> {
  log("Syncing drivers...");
  const drivers = season ? await fetchDriversBySeason(season) : await fetchDrivers();
  log(`  Found ${drivers.length} drivers`);
  for (const driver of drivers) {
    await upsertDriver(driver);
  }

  log("Syncing constructors...");
  const constructors = season
    ? await fetchConstructorsBySeason(season)
    : await fetchConstructors();
  log(`  Found ${constructors.length} constructors`);
  for (const constructor of constructors) {
    await upsertConstructor(constructor);
  }
}

async function syncSeason(year: number): Promise<void> {
  log(`\nSyncing season ${year}...`);

  const races = await fetchRacesByYear(year);
  log(`  Found ${races.length} races`);
  const today = new Date().toISOString().slice(0, 10);

  for (const race of races) {
    const round = parseInt(race.round, 10);
    log(`  Round ${round}: ${race.raceName}`);

    await upsertCircuit(race);
    const circuitId = await getCircuitId(race.Circuit.circuitId);
    if (!circuitId) {
      warn(`  Could not get circuit ID for ${race.Circuit.circuitId}, skipping round`);
      continue;
    }

    const raceId = await upsertRace(race, circuitId);
    if (!raceId) {
      warn(`  Could not get race ID for ${year}/${round}, skipping`);
      continue;
    }

    if (race.date && race.date > today) {
      log(`    Scheduled for ${race.date}; skipping result import until race weekend is complete`);
      continue;
    }

    try {
      const results = await fetchResultsByRace(year, round);
      log(`    ${results.length} results`);
      for (const result of results) {
        await upsertResult(raceId, result);
      }
    } catch (err) {
      failedEndpoints.push(`${year}/${round} results`);
      warn(`    Failed to fetch results for ${year}/${round}: ${String(err)}`);
    }

    try {
      const qualifyingResults = await fetchQualifyingByRace(year, round);
      log(`    ${qualifyingResults.length} qualifying results`);
      for (const q of qualifyingResults) {
        await upsertQualifying(raceId, q);
      }
    } catch (err) {
      failedEndpoints.push(`${year}/${round} qualifying`);
      warn(`    Failed to fetch qualifying for ${year}/${round}: ${String(err)}`);
    }

    const sprintResults = await fetchSprintByRace(year, round);
    if (sprintResults.length > 0) {
      log(`    ${sprintResults.length} sprint results`);
      for (const result of sprintResults) {
        await upsertResult(raceId, result, true);
      }
    }
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  log("F1-Versus data sync starting...");
  log(`Mode: ${forceSeason ? `season ${forceSeason}` : isIncremental ? "incremental (current season)" : "full sync"}`);

  const startTime = Date.now();

  try {
    let seasonsToSync: number[];

    if (forceSeason) {
      seasonsToSync = [forceSeason];
    } else if (isIncremental) {
      const availableSeasons = await fetchSeasons();
      const latestSeason = Math.max(...availableSeasons);
      seasonsToSync = [latestSeason];
      log(`Latest available Jolpica season: ${latestSeason}`);
    } else {
      log("\nFetching all seasons from Jolpica...");
      seasonsToSync = await fetchSeasons();
      log(`Found ${seasonsToSync.length} seasons to sync`);
    }

    await syncDriversAndConstructors(
      forceSeason || isIncremental ? seasonsToSync[0] : undefined
    );

    for (const season of seasonsToSync) {
      await syncSeason(season);
    }

    if (failedEndpoints.length > 0) {
      log("\nIncomplete endpoints detected:");
      for (const endpoint of failedEndpoints) {
        warn(`  ${endpoint}`);
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    log(`\n✓ Sync complete in ${elapsed}s`);
  } catch (err) {
    error("Fatal error during sync", err);
    process.exit(1);
  }
}

main();
