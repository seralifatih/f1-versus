/**
 * sync-f1db.ts
 *
 * 1. Downloads the latest F1DB sqlite release.
 * 2. Aggregates per-driver per-era metrics.
 * 3. Min-max normalizes each metric to 0-100 within each era bucket.
 * 4. Writes .cache/f1db/driver_stats.db (a fresh sqlite file with one table).
 * 5. Prints wrangler d1 commands to stdout. Does NOT execute them.
 *
 * Normalization choice: min-max within-era. Reasoning: counts like
 * championships are heavily right-skewed (most drivers have 0). Percentile
 * rank crushes the top end and inflates the middle; min-max preserves the
 * shape of the distribution so a Hamilton/Schumacher gap over the field still
 * reads as a gap after scaling. Trade-off accepted: a single outlier can
 * compress the rest, but that's already what the metric is telling us.
 *
 * Schema notes (F1DB v2026.x):
 *   - Tables are singular snake_case: driver, race, season_driver_standing.
 *   - race_data is a denormalized fact table; race_result, qualifying_result,
 *     and fastest_lap are views over it. We query the views.
 *   - Numeric position is `position_number` (nullable for DNF/DSQ).
 *   - race_result.fastest_lap is a boolean column for "who scored the FL".
 *   - Driver country: driver.nationality_country_id -> country.alpha2_code.
 *   - Sprint races appear in race_data with type='SPRINT_RACE_RESULT'; the
 *     plain race_result view excludes them, which is what we want.
 */

import { createWriteStream, existsSync, mkdirSync, statSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import Database from 'better-sqlite3'
import unzipper from 'unzipper'

const CACHE_DIR = join(process.cwd(), '.cache', 'f1db')
const SOURCE_ZIP = join(CACHE_DIR, 'f1db-sqlite.zip')
const SOURCE_DB = join(CACHE_DIR, 'f1db.db')
const OUTPUT_DB = join(CACHE_DIR, 'driver_stats.db')

const ERAS = [
  { id: 'all', minYear: 1950, maxYear: 9999 },
  { id: 'golden', minYear: 1950, maxYear: 1979 },
  { id: 'turbo', minYear: 1980, maxYear: 2005 },
  { id: 'modern', minYear: 2006, maxYear: 9999 },
] as const

type EraId = (typeof ERAS)[number]['id']

const METRIC_KEYS = ['c', 'w', 'p', 'q', 'f', 'r', 'h', 'l', 'd'] as const
type MetricKey = (typeof METRIC_KEYS)[number]

type RawRow = {
  driverId: string
  driverName: string
  countryCode: string | null
  firstYear: number
  lastYear: number
  c: number
  w: number
  p: number
  q: number
  f: number
  r: number
  h: number
  l: number
  d: number
}

async function main() {
  mkdirSync(CACHE_DIR, { recursive: true })

  await downloadLatestRelease()
  await unzipDb()

  const src = new Database(SOURCE_DB, { readonly: true })

  const out = new Database(OUTPUT_DB)
  out.pragma('journal_mode = WAL')
  out.exec(`
    DROP TABLE IF EXISTS driver_stats;
    CREATE TABLE driver_stats (
      driverId TEXT NOT NULL,
      eraId TEXT NOT NULL,
      driverName TEXT NOT NULL,
      countryCode TEXT,
      firstYear INTEGER NOT NULL,
      lastYear INTEGER NOT NULL,
      c REAL NOT NULL,
      w REAL NOT NULL,
      p REAL NOT NULL,
      q REAL NOT NULL,
      f REAL NOT NULL,
      r REAL NOT NULL,
      h REAL NOT NULL,
      l REAL NOT NULL,
      d REAL NOT NULL,
      PRIMARY KEY (driverId, eraId)
    );
  `)

  const insert = out.prepare(`
    INSERT INTO driver_stats
      (driverId, eraId, driverName, countryCode, firstYear, lastYear,
       c, w, p, q, f, r, h, l, d)
    VALUES
      (@driverId, @eraId, @driverName, @countryCode, @firstYear, @lastYear,
       @c, @w, @p, @q, @f, @r, @h, @l, @d)
  `)

  for (const era of ERAS) {
    console.log(`\n→ Era: ${era.id} (${era.minYear}–${era.maxYear === 9999 ? 'now' : era.maxYear})`)
    const raws = computeRaw(src, era.minYear, era.maxYear)
    console.log(`  ${raws.length} drivers with at least 1 start`)
    const normalized = normalize(raws)

    const tx = out.transaction((rows: RawRow[]) => {
      for (const row of rows) {
        insert.run({ ...row, eraId: era.id })
      }
    })
    tx(normalized)
  }

  src.close()
  out.close()

  console.log(`\n✓ Wrote ${OUTPUT_DB}`)
  printWranglerCommands()
}

// ────────────────────────────────────────────────────────────────────────────
// Download + extract
// ────────────────────────────────────────────────────────────────────────────

async function downloadLatestRelease() {
  if (existsSync(SOURCE_DB)) {
    const age = (Date.now() - statSync(SOURCE_DB).mtimeMs) / 1000 / 60 / 60
    if (age < 24) {
      console.log(`✓ Using cached f1db.db (${age.toFixed(1)}h old). Delete .cache/f1db to refresh.`)
      return
    }
  }

  console.log('→ Fetching latest F1DB release metadata…')
  const res = await fetch('https://api.github.com/repos/f1db/f1db/releases/latest', {
    headers: {
      'User-Agent': 'f1-versus-sync',
      Accept: 'application/vnd.github+json',
    },
  })
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`)
  const release = (await res.json()) as {
    tag_name: string
    assets: Array<{ name: string; browser_download_url: string }>
  }

  // Asset is `f1db-sqlite.zip` (unversioned). The pattern `f1db-sqlite-*.zip`
  // from the original spec doesn't match the current release naming.
  const asset = release.assets.find(
    (a) => a.name === 'f1db-sqlite.zip' || /^f1db-sqlite[-.].*\.zip$/.test(a.name),
  )
  if (!asset) {
    throw new Error(
      `No f1db-sqlite zip asset found in release ${release.tag_name}. Assets: ${release.assets.map((a) => a.name).join(', ')}`,
    )
  }

  console.log(`  release ${release.tag_name}, asset ${asset.name}`)
  console.log('→ Downloading…')
  const dl = await fetch(asset.browser_download_url)
  if (!dl.ok || !dl.body) throw new Error(`Download ${dl.status}`)
  await pipeline(Readable.fromWeb(dl.body as never), createWriteStream(SOURCE_ZIP))
  console.log(`  saved ${SOURCE_ZIP}`)
}

async function unzipDb() {
  if (existsSync(SOURCE_DB) && !existsSync(SOURCE_ZIP)) return
  if (!existsSync(SOURCE_ZIP)) return

  console.log('→ Unzipping…')
  const directory = await unzipper.Open.file(SOURCE_ZIP)
  const dbEntry = directory.files.find((f) => f.path.endsWith('.db'))
  if (!dbEntry) throw new Error(`No .db file in ${SOURCE_ZIP}`)
  await pipeline(dbEntry.stream(), createWriteStream(SOURCE_DB))
  await rm(SOURCE_ZIP)
  console.log(`  extracted ${SOURCE_DB}`)
}

// ────────────────────────────────────────────────────────────────────────────
// Aggregation
// ────────────────────────────────────────────────────────────────────────────

function computeRaw(db: Database.Database, minYear: number, maxYear: number): RawRow[] {
  // One CTE-fueled query per metric is clearer than one mega-query. SQLite
  // handles them fine at this scale (~800 drivers, ~78 seasons).

  // Driver universe for this era: anyone with a race_result row inside the
  // year window. driver.name is "First Last" already.
  const drivers = db
    .prepare(
      `
      SELECT
        d.id AS driverId,
        d.name AS driverName,
        c.alpha2_code AS countryCode,
        MIN(r.year) AS firstYear,
        MAX(r.year) AS lastYear
      FROM driver d
      JOIN race_result rr ON rr.driver_id = d.id
      JOIN race r ON r.id = rr.race_id
      LEFT JOIN country c ON c.id = d.nationality_country_id
      WHERE r.year BETWEEN ? AND ?
      GROUP BY d.id, d.name, c.alpha2_code
    `,
    )
    .all(minYear, maxYear) as Array<{
    driverId: string
    driverName: string
    countryCode: string | null
    firstYear: number
    lastYear: number
  }>

  const championships = mapCount(
    db
      .prepare(
        `
        SELECT sds.driver_id AS k, COUNT(*) AS v
        FROM season_driver_standing sds
        WHERE sds.position_number = 1 AND sds.year BETWEEN ? AND ?
        GROUP BY sds.driver_id
      `,
      )
      .all(minYear, maxYear) as Array<{ k: string; v: number }>,
  )

  const wins = mapCount(
    db
      .prepare(
        `
        SELECT rr.driver_id AS k, COUNT(*) AS v
        FROM race_result rr
        JOIN race r ON r.id = rr.race_id
        WHERE rr.position_number = 1 AND r.year BETWEEN ? AND ?
        GROUP BY rr.driver_id
      `,
      )
      .all(minYear, maxYear) as Array<{ k: string; v: number }>,
  )

  const podiums = mapCount(
    db
      .prepare(
        `
        SELECT rr.driver_id AS k, COUNT(*) AS v
        FROM race_result rr
        JOIN race r ON r.id = rr.race_id
        WHERE rr.position_number BETWEEN 1 AND 3 AND r.year BETWEEN ? AND ?
        GROUP BY rr.driver_id
      `,
      )
      .all(minYear, maxYear) as Array<{ k: string; v: number }>,
  )

  const poles = mapCount(
    db
      .prepare(
        `
        SELECT qr.driver_id AS k, COUNT(*) AS v
        FROM qualifying_result qr
        JOIN race r ON r.id = qr.race_id
        WHERE qr.position_number = 1 AND r.year BETWEEN ? AND ?
        GROUP BY qr.driver_id
      `,
      )
      .all(minYear, maxYear) as Array<{ k: string; v: number }>,
  )

  // race_result.fastest_lap is a boolean (1/0) marking who set the race FL.
  const fastestLaps = mapCount(
    db
      .prepare(
        `
        SELECT rr.driver_id AS k, COUNT(*) AS v
        FROM race_result rr
        JOIN race r ON r.id = rr.race_id
        WHERE rr.fastest_lap = 1 AND r.year BETWEEN ? AND ?
        GROUP BY rr.driver_id
      `,
      )
      .all(minYear, maxYear) as Array<{ k: string; v: number }>,
  )

  // Starts: any race_result row counts as an appearance (DNFs included).
  const starts = mapCount(
    db
      .prepare(
        `
        SELECT rr.driver_id AS k, COUNT(*) AS v
        FROM race_result rr
        JOIN race r ON r.id = rr.race_id
        WHERE r.year BETWEEN ? AND ?
        GROUP BY rr.driver_id
      `,
      )
      .all(minYear, maxYear) as Array<{ k: string; v: number }>,
  )

  // Teammate H2H race: for each (race, constructor) pair, compare the driver
  // to each other driver in the same car. Only count comparisons where BOTH
  // drivers have a numeric position. Score = wins / total.
  const teammateRace = mapH2H(
    db
      .prepare(
        `
        SELECT a.driver_id AS k,
               SUM(CASE WHEN a.position_number < b.position_number THEN 1 ELSE 0 END) AS wins,
               COUNT(*) AS total
        FROM race_result a
        JOIN race_result b
          ON b.race_id = a.race_id
         AND b.constructor_id = a.constructor_id
         AND b.driver_id <> a.driver_id
        JOIN race r ON r.id = a.race_id
        WHERE a.position_number IS NOT NULL
          AND b.position_number IS NOT NULL
          AND r.year BETWEEN ? AND ?
        GROUP BY a.driver_id
      `,
      )
      .all(minYear, maxYear) as Array<{ k: string; wins: number; total: number }>,
  )

  const teammateQuali = mapH2H(
    db
      .prepare(
        `
        SELECT a.driver_id AS k,
               SUM(CASE WHEN a.position_number < b.position_number THEN 1 ELSE 0 END) AS wins,
               COUNT(*) AS total
        FROM qualifying_result a
        JOIN qualifying_result b
          ON b.race_id = a.race_id
         AND b.constructor_id = a.constructor_id
         AND b.driver_id <> a.driver_id
        JOIN race r ON r.id = a.race_id
        WHERE a.position_number IS NOT NULL
          AND b.position_number IS NOT NULL
          AND r.year BETWEEN ? AND ?
        GROUP BY a.driver_id
      `,
      )
      .all(minYear, maxYear) as Array<{ k: string; wins: number; total: number }>,
  )

  // Peak dominance: best 3-consecutive-season sum of points-share-of-season.
  // points-share = driver_points_in_year / total_points_in_year.
  const peakDominance = computePeakDominance(db, minYear, maxYear)

  const out: RawRow[] = []
  for (const d of drivers) {
    const startCount = starts.get(d.driverId) ?? 0
    if (startCount === 0) continue
    const winCount = wins.get(d.driverId) ?? 0
    // The 9-metric model in the prototype has a single 'h' (Teammate H2H).
    // F1DB gives us race and quali separately — average them for the metric.
    const h = ((teammateRace.get(d.driverId) ?? 0) + (teammateQuali.get(d.driverId) ?? 0)) / 2
    out.push({
      driverId: d.driverId,
      driverName: d.driverName,
      countryCode: d.countryCode,
      firstYear: d.firstYear,
      lastYear: d.lastYear,
      c: championships.get(d.driverId) ?? 0,
      w: winCount,
      p: podiums.get(d.driverId) ?? 0,
      q: poles.get(d.driverId) ?? 0,
      f: fastestLaps.get(d.driverId) ?? 0,
      r: winCount / startCount,
      h,
      l: d.lastYear - d.firstYear + 1,
      d: peakDominance.get(d.driverId) ?? 0,
    })
  }
  return out
}

function mapCount(rows: Array<{ k: string; v: number }>): Map<string, number> {
  const m = new Map<string, number>()
  for (const r of rows) m.set(r.k, r.v)
  return m
}

function mapH2H(rows: Array<{ k: string; wins: number; total: number }>): Map<string, number> {
  const m = new Map<string, number>()
  for (const r of rows) m.set(r.k, r.total > 0 ? r.wins / r.total : 0)
  return m
}

function computePeakDominance(
  db: Database.Database,
  minYear: number,
  maxYear: number,
): Map<string, number> {
  // points-share per driver-year inside the era window.
  const rows = db
    .prepare(
      `
      WITH season_totals AS (
        SELECT year, SUM(points) AS total
        FROM season_driver_standing
        WHERE year BETWEEN ? AND ?
        GROUP BY year
      )
      SELECT sds.driver_id AS driverId, sds.year, sds.points / NULLIF(st.total, 0) AS share
      FROM season_driver_standing sds
      JOIN season_totals st ON st.year = sds.year
      WHERE sds.year BETWEEN ? AND ?
    `,
    )
    .all(minYear, maxYear, minYear, maxYear) as Array<{
    driverId: string
    year: number
    share: number | null
  }>

  const byDriver = new Map<string, Map<number, number>>()
  for (const r of rows) {
    const m = byDriver.get(r.driverId) ?? new Map<number, number>()
    m.set(r.year, r.share ?? 0)
    byDriver.set(r.driverId, m)
  }

  const result = new Map<string, number>()
  for (const [driverId, seasons] of byDriver) {
    const years = Array.from(seasons.keys()).sort((a, b) => a - b)
    let best = 0
    for (let i = 0; i + 2 < years.length; i++) {
      const y0 = years[i]
      const y1 = years[i + 1]
      const y2 = years[i + 2]
      if (y0 === undefined || y1 === undefined || y2 === undefined) continue
      // Only count truly consecutive triples.
      if (y1 !== y0 + 1 || y2 !== y0 + 2) continue
      const sum = (seasons.get(y0) ?? 0) + (seasons.get(y1) ?? 0) + (seasons.get(y2) ?? 0)
      if (sum > best) best = sum
    }
    // Fallback: if the driver has fewer than 3 consecutive seasons, use their
    // single best year share. Keeps Fangio-era short careers competitive.
    if (best === 0) {
      for (const share of seasons.values()) if (share > best) best = share
    }
    result.set(driverId, best)
  }
  return result
}

// ────────────────────────────────────────────────────────────────────────────
// Normalization (min-max within era)
// ────────────────────────────────────────────────────────────────────────────

function normalize(rows: RawRow[]): RawRow[] {
  if (rows.length === 0) return rows
  const out = rows.map((r) => ({ ...r }))
  for (const key of METRIC_KEYS) {
    let min = Infinity
    let max = -Infinity
    for (const r of out) {
      const v = r[key]
      if (v < min) min = v
      if (v > max) max = v
    }
    const span = max - min
    for (const r of out) {
      r[key] = span > 0 ? ((r[key] - min) / span) * 100 : 0
    }
  }
  return out
}

// ────────────────────────────────────────────────────────────────────────────
// Wrangler instructions
// ────────────────────────────────────────────────────────────────────────────

function printWranglerCommands() {
  const dump = join(CACHE_DIR, 'driver_stats.sql')
  const lines = [
    '',
    '━'.repeat(72),
    'Next steps — push to Cloudflare D1 (run manually when ready)',
    '━'.repeat(72),
    '',
    '# 1. Dump the local sqlite to SQL:',
    `sqlite3 "${OUTPUT_DB}" .dump > "${dump}"`,
    '',
    '# 2. Apply the schema and data to the dev database:',
    `npx wrangler d1 execute f1versus-dev --local --file="${dump}"`,
    `npx wrangler d1 execute f1versus-dev --remote --file="${dump}"`,
    '',
    '# 3. When you are happy with dev, apply to prod:',
    `npx wrangler d1 execute f1versus-prod --remote --file="${dump}"`,
    '',
    '# (If you have not created the D1 databases yet:)',
    '# npx wrangler d1 create f1versus-dev',
    '# npx wrangler d1 create f1versus-prod',
    '',
    '━'.repeat(72),
    '',
  ]
  for (const l of lines) console.log(l)
}

// ────────────────────────────────────────────────────────────────────────────

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
