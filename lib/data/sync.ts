/**
 * Jolpica API fetch utilities with rate limiting.
 *
 * Rate limit: 200 req/hr -> max ~3.33 req/min -> 18s minimum between requests.
 * We use a conservative 20s delay queue.
 *
 * CLI usage (either entry point works):
 *   npx tsx lib/data/sync.ts [--incremental] [--season=YYYY]
 *   npx tsx scripts/sync-data.ts [--incremental] [--season=YYYY]
 *   npm run sync
 *   npm run sync:incremental
 */

import type {
  JolpicaResponse,
  JolpicaDriver,
  JolpicaConstructor,
  JolpicaRace,
  JolpicaResult,
  JolpicaQualifyingResult,
} from "./types";

const BASE_URL = "http://api.jolpi.ca/ergast/f1";
const RATE_LIMIT_DELAY_MS = 20_000; // 20 seconds between requests
const DEFAULT_LIMIT = 1000;
const MAX_RETRIES = 3;
const MAX_429_RETRY_DELAY_MS = 5 * 60_000;
const MAX_TRANSIENT_RETRY_DELAY_MS = 30_000;
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

let lastRequestTime = 0;

async function rateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < RATE_LIMIT_DELAY_MS && lastRequestTime > 0) {
    const wait = RATE_LIMIT_DELAY_MS - elapsed;
    await sleep(wait);
  }
  lastRequestTime = Date.now();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterMs(headerValue: string | null): number | null {
  if (!headerValue) return null;

  const retryAfterSeconds = Number(headerValue);
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
    return retryAfterSeconds * 1000;
  }

  const retryAfterDate = Date.parse(headerValue);
  if (Number.isNaN(retryAfterDate)) return null;

  return Math.max(retryAfterDate - Date.now(), 0);
}

function getRetryDelayMs(status: number | null, attempt: number, retryAfterMs: number | null): number {
  if (retryAfterMs !== null) {
    return retryAfterMs;
  }

  if (status === 429) {
    return Math.min(60_000 * attempt, MAX_429_RETRY_DELAY_MS);
  }

  return Math.min(5_000 * 2 ** (attempt - 1), MAX_TRANSIENT_RETRY_DELAY_MS);
}

async function jolpicaFetch<T>(
  path: string,
  params: Record<string, string | number> = {}
): Promise<JolpicaResponse<T>> {
  const url = new URL(`${BASE_URL}${path}.json`);
  url.searchParams.set("limit", String(params.limit ?? DEFAULT_LIMIT));
  if (params.offset) {
    url.searchParams.set("offset", String(params.offset));
  }

  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt += 1) {
    await rateLimit();

    let res: Response;
    try {
      res = await fetch(url.toString(), {
        headers: {
          "User-Agent": "F1-Versus/1.0 (f1-versus.com)",
        },
        cache: "no-store",
      });
    } catch (error) {
      if (attempt > MAX_RETRIES) {
        throw error;
      }

      const delayMs = getRetryDelayMs(null, attempt, null);
      console.warn(
        `[Jolpica] Network error: ${url.toString()}; retrying in ${Math.ceil(delayMs / 1000)}s (${attempt}/${MAX_RETRIES})`
      );
      await sleep(delayMs);
      continue;
    }

    if (res.ok) {
      return res.json() as Promise<JolpicaResponse<T>>;
    }

    if (!RETRYABLE_STATUSES.has(res.status) || attempt > MAX_RETRIES) {
      throw new Error(`Jolpica API error ${res.status}: ${url.toString()}`);
    }

    const retryAfterMs = parseRetryAfterMs(res.headers.get("retry-after"));
    const delayMs = getRetryDelayMs(res.status, attempt, retryAfterMs);
    console.warn(
      `[Jolpica] HTTP ${res.status}: ${url.toString()}; retrying in ${Math.ceil(delayMs / 1000)}s (${attempt}/${MAX_RETRIES})`
    );
    await sleep(delayMs);
  }

  throw new Error(`Jolpica API error: exhausted retries for ${url.toString()}`);
}

/**
 * Paginates through all results for a given endpoint.
 * Jolpica returns total count in MRData.total.
 */
async function fetchAllPages<T>(
  path: string,
  extractList: (data: JolpicaResponse<T>["MRData"]) => T[]
): Promise<T[]> {
  const firstPage = await jolpicaFetch<T>(path, { limit: DEFAULT_LIMIT, offset: 0 });
  const total = parseInt(firstPage.MRData.total, 10);
  const items = extractList(firstPage.MRData);
  const pageSize = parseInt(firstPage.MRData.limit, 10) || items.length || DEFAULT_LIMIT;

  if (total <= items.length) return items;

  const remaining: T[] = [];
  for (let offset = pageSize; offset < total; offset += pageSize) {
    const page = await jolpicaFetch<T>(path, { limit: pageSize, offset });
    remaining.push(...extractList(page.MRData));
  }

  return [...items, ...remaining];
}

/**
 * Fetch all available F1 seasons.
 */
export async function fetchSeasons(): Promise<number[]> {
  const data = await jolpicaFetch<{ season: string }>("/seasons", { limit: 100 });
  const seasons = data.MRData.SeasonTable?.Seasons ?? [];
  return seasons.map((s) => parseInt((s as unknown as { season: string }).season, 10));
}

/**
 * Fetch all races for a given season.
 */
export async function fetchRacesByYear(year: number): Promise<JolpicaRace[]> {
  const data = await jolpicaFetch<JolpicaRace>(`/${year}/races`);
  return data.MRData.RaceTable?.Races ?? [];
}

/**
 * Fetch race results for a specific race.
 */
export async function fetchResultsByRace(
  year: number,
  round: number
): Promise<JolpicaResult[]> {
  const data = await jolpicaFetch<JolpicaRace>(`/${year}/${round}/results`);
  const race = data.MRData.RaceTable?.Races?.[0];
  return race?.Results ?? [];
}

/**
 * Fetch qualifying results for a specific race.
 */
export async function fetchQualifyingByRace(
  year: number,
  round: number
): Promise<JolpicaQualifyingResult[]> {
  const data = await jolpicaFetch<JolpicaRace>(`/${year}/${round}/qualifying`);
  const race = data.MRData.RaceTable?.Races?.[0];
  return race?.QualifyingResults ?? [];
}

/**
 * Fetch sprint results for a specific race (where applicable).
 */
export async function fetchSprintByRace(
  year: number,
  round: number
): Promise<JolpicaResult[]> {
  try {
    const data = await jolpicaFetch<JolpicaRace>(`/${year}/${round}/sprint`);
    const race = data.MRData.RaceTable?.Races?.[0];
    return race?.SprintResults ?? [];
  } catch {
    return [];
  }
}

/**
 * Fetch all drivers in Jolpica's database.
 */
export async function fetchDrivers(): Promise<JolpicaDriver[]> {
  return fetchAllPages<JolpicaDriver>("/drivers", (mrdata) => mrdata.DriverTable?.Drivers ?? []);
}

/**
 * Fetch all constructors in Jolpica's database.
 */
export async function fetchConstructors(): Promise<JolpicaConstructor[]> {
  return fetchAllPages<JolpicaConstructor>(
    "/constructors",
    (mrdata) => mrdata.ConstructorTable?.Constructors ?? []
  );
}

/**
 * Fetch all drivers for a specific season.
 */
export async function fetchDriversBySeason(year: number): Promise<JolpicaDriver[]> {
  const data = await jolpicaFetch<JolpicaDriver>(`/${year}/drivers`);
  return data.MRData.DriverTable?.Drivers ?? [];
}

/**
 * Fetch all constructors for a specific season.
 */
export async function fetchConstructorsBySeason(year: number): Promise<JolpicaConstructor[]> {
  const data = await jolpicaFetch<JolpicaConstructor>(`/${year}/constructors`);
  return data.MRData.ConstructorTable?.Constructors ?? [];
}

/**
 * Team color lookup - a best-effort static map for known constructors.
 * The authoritative source is the `constructors.color_hex` column in Supabase.
 * This is used as a fallback during initial seeding.
 */
export const CONSTRUCTOR_COLORS: Record<string, string> = {
  red_bull: "#3671C6",
  ferrari: "#E8002D",
  mercedes: "#27F4D2",
  mclaren: "#FF8000",
  aston_martin: "#229971",
  alpine: "#FF87BC",
  williams: "#64C4FF",
  rb: "#6692FF",
  kick_sauber: "#52E252",
  haas: "#B6BABD",
  renault: "#FFE900",
  lotus_f1: "#FFB800",
  force_india: "#FF80C7",
  racing_point: "#F596C8",
  toro_rosso: "#469BFF",
  alfa: "#B12039",
  manor: "#EE3D3D",
  sauber: "#9B0000",
  hrt: "#B2945A",
  caterham: "#005030",
  virgin: "#CC0000",
  brawn: "#80FF00",
  toyota: "#CC0600",
  bmw_sauber: "#6CC4F0",
  honda: "#FFFFFF",
  super_aguri: "#CC1100",
  spyker: "#F39300",
  midland: "#C83232",
  jordan: "#ECEA0C",
  bar: "#C8AA00",
  jaguar: "#00594F",
  minardi: "#191919",
  prost: "#0088CC",
  arrows: "#FF7700",
  benetton: "#00A650",
  tyrrell: "#2244AA",
  brabham: "#006633",
  matra: "#0055AA",
};
