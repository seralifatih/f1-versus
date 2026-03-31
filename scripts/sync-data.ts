/**
 * scripts/sync-data.ts
 *
 * CLI entrypoint for syncing F1 data from Jolpica API into Supabase.
 *
 * Usage:
 *   npx tsx scripts/sync-data.ts              — full sync (all seasons)
 *   npx tsx scripts/sync-data.ts --incremental — current season only
 *   npx tsx scripts/sync-data.ts --season=2023 — specific season
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
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

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

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

// ─── Upsert helpers ────────────────────────────────────────────────────────

async function upsertDriver(driver: JolpicaDriver): Promise<void> {
  const { error: err } = await supabase.from("drivers").upsert(
    {
      driver_ref: driver.driverId,
      first_name: driver.givenName,
      last_name: driver.familyName,
      dob: driver.dateOfBirth ?? null,
      nationality: driver.nationality ?? null,
      headshot_url: null, // Populated separately from official F1 sources
    },
    { onConflict: "driver_ref", ignoreDuplicates: false }
  );
  if (err) warn(`Failed to upsert driver ${driver.driverId}: ${err.message}`);
}

async function upsertConstructor(constructor: JolpicaConstructor): Promise<void> {
  const colorHex = CONSTRUCTOR_COLORS[constructor.constructorId] ?? null;
  const payload = {
    constructor_ref: constructor.constructorId,
    name: constructor.name,
    ...(colorHex ? { color_hex: colorHex } : {}),
  };
  const { error: err } = await supabase.from("constructors").upsert(
    payload,
    { onConflict: "constructor_ref", ignoreDuplicates: false }
  );
  if (err) warn(`Failed to upsert constructor ${constructor.constructorId}: ${err.message}`);
}

async function upsertCircuit(race: JolpicaRace): Promise<void> {
  const c = race.Circuit;
  const payload = {
    circuit_ref: c.circuitId,
    name: c.circuitName,
    country: c.Location.country,
    lat: parseFloat(c.Location.lat),
    lng: parseFloat(c.Location.long),
  };
  const { error: err } = await supabase.from("circuits").upsert(
    payload,
    { onConflict: "circuit_ref", ignoreDuplicates: false }
  );
  if (err) warn(`Failed to upsert circuit ${c.circuitId}: ${err.message}`);
}

async function getOrCreateCircuitId(circuitRef: string): Promise<string | null> {
  const { data } = await supabase
    .from("circuits")
    .select("id")
    .eq("circuit_ref", circuitRef)
    .single();
  return data?.id ?? null;
}

async function getOrCreateDriverId(driverRef: string): Promise<string | null> {
  const { data } = await supabase
    .from("drivers")
    .select("id")
    .eq("driver_ref", driverRef)
    .single();
  return data?.id ?? null;
}

async function getOrCreateConstructorId(constructorRef: string): Promise<string | null> {
  const { data } = await supabase
    .from("constructors")
    .select("id")
    .eq("constructor_ref", constructorRef)
    .single();
  return data?.id ?? null;
}

async function upsertRace(race: JolpicaRace, circuitId: string): Promise<string | null> {
  const { data, error: err } = await supabase
    .from("races")
    .upsert(
      {
        season: parseInt(race.season, 10),
        round: parseInt(race.round, 10),
        circuit_id: circuitId,
        date: race.date,
        name: race.raceName,
      },
      { onConflict: "season,round" }
    )
    .select("id")
    .single();

  if (err) {
    warn(`Failed to upsert race ${race.season}/${race.round}: ${err.message}`);
    return null;
  }
  return data?.id ?? null;
}

async function upsertResult(
  raceId: string,
  result: JolpicaResult,
  isSprint = false
): Promise<void> {
  const driverId = await getOrCreateDriverId(result.Driver.driverId);
  const constructorId = await getOrCreateConstructorId(result.Constructor.constructorId);

  if (!driverId || !constructorId) {
    warn(
      `Skipping result for ${result.Driver.driverId} — missing driver or constructor ID`
    );
    return;
  }

  const position = parsePosition(result.positionText);
  const grid = parseInt(result.grid, 10);

  const { error: err } = await supabase.from("results").upsert(
    {
      race_id: raceId,
      driver_id: driverId,
      constructor_id: constructorId,
      grid: isNaN(grid) ? null : grid,
      position,
      points: parseFloat(result.points) || 0,
      status: result.status ?? null,
      fastest_lap_time: result.FastestLap?.Time?.time ?? null,
      fastest_lap_rank: result.FastestLap?.rank ? parseInt(result.FastestLap.rank, 10) : null,
      is_sprint: isSprint,
    },
    { onConflict: "race_id,driver_id,is_sprint" }
  );

  if (err) {
    warn(
      `Failed to upsert result for ${result.Driver.driverId} in race ${raceId}: ${err.message}`
    );
  }
}

async function upsertQualifying(
  raceId: string,
  result: JolpicaQualifyingResult
): Promise<void> {
  const driverId = await getOrCreateDriverId(result.Driver.driverId);
  const constructorId = await getOrCreateConstructorId(result.Constructor.constructorId);

  if (!driverId || !constructorId) {
    warn(
      `Skipping qualifying for ${result.Driver.driverId} — missing driver or constructor ID`
    );
    return;
  }

  const position = parsePosition(result.position);

  const { error: err } = await supabase.from("qualifying").upsert(
    {
      race_id: raceId,
      driver_id: driverId,
      constructor_id: constructorId,
      q1_time: result.Q1 ?? null,
      q2_time: result.Q2 ?? null,
      q3_time: result.Q3 ?? null,
      position,
    },
    { onConflict: "race_id,driver_id" }
  );

  if (err) {
    warn(
      `Failed to upsert qualifying for ${result.Driver.driverId} in race ${raceId}: ${err.message}`
    );
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

    // Upsert circuit
    await upsertCircuit(race);
    const circuitId = await getOrCreateCircuitId(race.Circuit.circuitId);
    if (!circuitId) {
      warn(`  Could not get circuit ID for ${race.Circuit.circuitId}, skipping round`);
      continue;
    }

    // Upsert race
    const raceId = await upsertRace(race, circuitId);
    if (!raceId) {
      warn(`  Could not get race ID for ${year}/${round}, skipping`);
      continue;
    }

    if (race.date && race.date > today) {
      log(`    Scheduled for ${race.date}; skipping result import until race weekend is complete`);
      continue;
    }

    // Fetch and upsert race results
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

    // Fetch and upsert qualifying
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

    // Fetch sprint results (won't throw — returns empty array for non-sprint rounds)
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

  // Validate environment
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

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
      // Full sync: all seasons from 1950 to current
      log("\nFetching all seasons from Jolpica...");
      seasonsToSync = await fetchSeasons();
      log(`Found ${seasonsToSync.length} seasons to sync`);
    }

    // For incremental/single-season runs, only seed the current season's roster first.
    // For full sync, seed the full historical driver/constructor list once.
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
      log("Rerun the affected seasons sequentially after the other sync processes have stopped.");
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    log(`\n✓ Sync complete in ${elapsed}s`);
  } catch (err) {
    error("Fatal error during sync", err);
    process.exit(1);
  }
}

main();
