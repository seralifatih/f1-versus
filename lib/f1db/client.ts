/// <reference types="@cloudflare/workers-types" />
/**
 * F1DB client.
 *
 * In Cloudflare Workers (prod + `wrangler dev`), reads from the D1 binding
 * named `DB` via @opennextjs/cloudflare's request context.
 *
 * In plain Node dev (`next dev`), falls back to the local sqlite file at
 * .cache/f1db/driver_stats.db via better-sqlite3. The better-sqlite3 import
 * is dynamic and guarded so the Workers bundle never includes it.
 */

import type { DriverStats, EraId, Metrics } from './types'

type Row = {
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

// ────────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────────

export async function getAllDriverStats(era: EraId): Promise<DriverStats[]> {
  const db = await resolveDb()
  const rows = await db.all<Row>(
    `SELECT * FROM driver_stats WHERE eraId = ? ORDER BY driverName`,
    [era],
  )
  return rows.map(toDriverStats)
}

export async function getDriverById(id: string, era: EraId): Promise<DriverStats | null> {
  const db = await resolveDb()
  const row = await db.first<Row>(`SELECT * FROM driver_stats WHERE driverId = ? AND eraId = ?`, [
    id,
    era,
  ])
  return row ? toDriverStats(row) : null
}

export async function getDriversByIds(ids: string[], era: EraId): Promise<DriverStats[]> {
  if (ids.length === 0) return []
  const db = await resolveDb()
  const placeholders = ids.map(() => '?').join(',')
  const rows = await db.all<Row>(
    `SELECT * FROM driver_stats WHERE eraId = ? AND driverId IN (${placeholders})`,
    [era, ...ids],
  )
  return rows.map(toDriverStats)
}

// ────────────────────────────────────────────────────────────────────────────
// DB adapter — thin uniform interface over D1 and better-sqlite3
// ────────────────────────────────────────────────────────────────────────────

type Adapter = {
  all<T>(sql: string, params: unknown[]): Promise<T[]>
  first<T>(sql: string, params: unknown[]): Promise<T | null>
}

let cachedLocal: Adapter | null = null

async function resolveDb(): Promise<Adapter> {
  const d1 = await tryD1()
  if (d1) return d1

  if (process.env.NODE_ENV === 'production') {
    throw new Error('D1 binding `DB` not available and local fallback is dev-only')
  }
  if (!cachedLocal) cachedLocal = await openLocal()
  return cachedLocal
}

async function tryD1(): Promise<Adapter | null> {
  try {
    const mod = await import('@opennextjs/cloudflare')
    const ctx = mod.getCloudflareContext()
    const binding = ctx?.env?.DB as D1Database | undefined
    if (!binding) return null
    return {
      async all<T>(sql: string, params: unknown[]) {
        const res = await binding
          .prepare(sql)
          .bind(...params)
          .all<T>()
        return res.results ?? []
      },
      async first<T>(sql: string, params: unknown[]) {
        const res = await binding
          .prepare(sql)
          .bind(...params)
          .first<T>()
        return res ?? null
      },
    }
  } catch {
    return null
  }
}

async function openLocal(): Promise<Adapter> {
  // Indirect require defeats bundler static analysis so this never lands in
  // the Workers bundle. Only runs under `next dev` on Node.
  const nodeRequire = eval('require') as NodeRequire
  const Database = nodeRequire('better-sqlite3') as typeof import('better-sqlite3')
  const path = nodeRequire('node:path') as typeof import('node:path')
  const dbPath = path.join(process.cwd(), '.cache', 'f1db', 'driver_stats.db')
  const db = new Database(dbPath, { readonly: true, fileMustExist: true })
  return {
    async all<T>(sql: string, params: unknown[]) {
      return db.prepare(sql).all(...params) as T[]
    },
    async first<T>(sql: string, params: unknown[]) {
      const row = db.prepare(sql).get(...params) as T | undefined
      return row ?? null
    },
  }
}

// ────────────────────────────────────────────────────────────────────────────

function toDriverStats(row: Row): DriverStats {
  const metrics: Metrics = {
    c: row.c,
    w: row.w,
    p: row.p,
    q: row.q,
    f: row.f,
    r: row.r,
    h: row.h,
    l: row.l,
    d: row.d,
  }
  return {
    driverId: row.driverId,
    name: row.driverName,
    countryCode: row.countryCode,
    firstYear: row.firstYear,
    lastYear: row.lastYear,
    metrics,
  }
}
