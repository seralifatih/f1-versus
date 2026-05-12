/**
 * Produces a D1-friendly SQL dump of driver_stats.
 *
 * `sqlite3 .dump` includes PRAGMA statements and a wrapping transaction
 * that D1 either ignores or chokes on. This script emits just the schema
 * and INSERT rows, which D1 imports cleanly.
 */

import Database from 'better-sqlite3'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC = join(process.cwd(), '.cache', 'f1db', 'driver_stats.db')
const OUT = join(process.cwd(), '.cache', 'f1db', 'driver_stats.sql')

const db = new Database(SRC, { readonly: true })

const rows = db
  .prepare(
    `SELECT driverId, eraId, driverName, countryCode, firstYear, lastYear,
            c, w, p, q, f, r, h, l, d
     FROM driver_stats`,
  )
  .all() as Array<Record<string, string | number | null>>

const lines: string[] = []

lines.push('DROP TABLE IF EXISTS driver_stats;')
lines.push(`CREATE TABLE driver_stats (
  driverId    TEXT NOT NULL,
  eraId       TEXT NOT NULL,
  driverName  TEXT NOT NULL,
  countryCode TEXT,
  firstYear   INTEGER NOT NULL,
  lastYear    INTEGER NOT NULL,
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
);`)
lines.push('CREATE INDEX idx_driver_stats_era ON driver_stats (eraId);')

const esc = (v: string | number | null): string => {
  if (v === null) return 'NULL'
  if (typeof v === 'number') {
    // Round REAL columns to 4 decimals to keep the file size reasonable.
    return Number.isInteger(v) ? String(v) : v.toFixed(4)
  }
  return `'${v.replace(/'/g, "''")}'`
}

for (const r of rows) {
  const values = [
    esc(r.driverId as string),
    esc(r.eraId as string),
    esc(r.driverName as string),
    esc(r.countryCode as string | null),
    esc(r.firstYear as number),
    esc(r.lastYear as number),
    esc(r.c as number),
    esc(r.w as number),
    esc(r.p as number),
    esc(r.q as number),
    esc(r.f as number),
    esc(r.r as number),
    esc(r.h as number),
    esc(r.l as number),
    esc(r.d as number),
  ].join(',')
  lines.push(`INSERT INTO driver_stats VALUES(${values});`)
}

writeFileSync(OUT, lines.join('\n') + '\n', 'utf8')
console.log(`wrote ${rows.length} rows to ${OUT}`)
db.close()
