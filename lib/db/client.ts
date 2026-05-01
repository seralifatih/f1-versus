/**
 * D1 database client abstraction.
 *
 * In Cloudflare Workers/Pages, D1 is accessed via the `DB` binding injected
 * into the Worker's env object. There is no URL or API key — the binding is
 * wired up in wrangler.toml and available at runtime as `process.env.DB` is
 * NOT how it works; instead it comes via the CF env object.
 *
 * For Next.js on Cloudflare Pages (via @opennextjs/cloudflare), the binding
 * is exposed on `process.env.DB` as a D1Database object at runtime.
 *
 * For scripts that run locally (sync-data.ts, compute-comparisons.ts), we use
 * better-sqlite3 against the local Wrangler D1 state file, wrapped in the same
 * interface so call sites are identical.
 *
 * Interface contract:
 *   db.prepare(sql: string) → D1PreparedStatement-compatible
 *     .bind(...values)      → bound statement
 *     .all<T>()             → Promise<{ results: T[] }>
 *     .first<T>()           → Promise<T | null>
 *     .run()                → Promise<D1Result>
 */

export interface D1Database {
  prepare(sql: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec(sql: string): Promise<D1ExecResult>;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  first<T = Record<string, unknown>>(colName?: string): Promise<T | null>;
  run(): Promise<D1Result>;
}

export interface D1Result<T = Record<string, unknown>> {
  results: T[];
  success: boolean;
  meta?: Record<string, unknown>;
}

export interface D1ExecResult {
  count: number;
  duration: number;
}

// ─── Runtime client (Cloudflare Workers / Pages) ───────────────────────────

/**
 * Returns the D1 binding from the Cloudflare runtime environment.
 * Call this inside Route Handlers and Server Components at request time.
 *
 * @opennextjs/cloudflare exposes bindings via `process.env` as live objects.
 */
export function getDB(): D1Database {
  // Access the D1 binding via the Cloudflare Workers global context.
  // @opennextjs/cloudflare stores the CF env on globalThis[Symbol.for("__cloudflare-context__")]
  const cfCtx = (globalThis as unknown as Record<symbol, { env?: Record<string, unknown> }>)[
    Symbol.for("__cloudflare-context__")
  ];
  const db = cfCtx?.env?.DB as D1Database | undefined;
  if (db) return db;

  throw new Error(
    "D1 binding 'DB' not found. " +
      "In production this is set by @opennextjs/cloudflare on globalThis. " +
      "Locally, run `wrangler dev` or use the script DB client."
  );
}

export function hasDB(): boolean {
  try {
    const cfCtx = (globalThis as unknown as Record<symbol, { env?: Record<string, unknown> }>)[
      Symbol.for("__cloudflare-context__")
    ];
    return Boolean(cfCtx?.env?.DB);
  } catch {
    return false;
  }
}

// ─── Script client (local better-sqlite3) ─────────────────────────────────

/**
 * Synchronous SQLite wrapper that matches the D1Database async interface.
 * Used by sync-data.ts and compute-comparisons.ts which run via tsx locally.
 *
 * Pass the path to the SQLite file (defaults to wrangler's local D1 state).
 */
export function createScriptDB(dbPath?: string): D1Database {
  // Dynamic require to avoid bundling better-sqlite3 into the Worker
  // eslint-disable-next-line
  const Database = require("better-sqlite3") as typeof import("better-sqlite3");
  const resolvedPath = dbPath ?? resolveLocalD1Path();
  const sqlite = new Database(resolvedPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  function wrapStatement(stmt: import("better-sqlite3").Statement): D1PreparedStatement {
    let boundValues: unknown[] = [];

    const bound: D1PreparedStatement = {
      bind(...values: unknown[]) {
        boundValues = values;
        return bound;
      },
      async all<T>(): Promise<D1Result<T>> {
        const results = stmt.all(...boundValues) as T[];
        return { results, success: true };
      },
      async first<T>(colName?: string): Promise<T | null> {
        const row = stmt.get(...boundValues) as Record<string, unknown> | undefined;
        if (!row) return null;
        if (colName) return (row[colName] as T) ?? null;
        return row as T;
      },
      async run(): Promise<D1Result> {
        stmt.run(...boundValues);
        return { results: [], success: true };
      },
    };
    return bound;
  }

  return {
    prepare(sql: string): D1PreparedStatement {
      const stmt = sqlite.prepare(sql);
      return wrapStatement(stmt);
    },
    async batch<T>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
      const results: D1Result<T>[] = [];
      const runBatch = sqlite.transaction(() => {
        for (const s of statements) {
          // Run each statement — best effort for batch
          void s.run();
          results.push({ results: [], success: true });
        }
      });
      runBatch();
      return results;
    },
    async exec(sql: string): Promise<D1ExecResult> {
      sqlite.exec(sql);
      return { count: 0, duration: 0 };
    },
  };
}

function resolveLocalD1Path(): string {
  // Wrangler stores local D1 state at .wrangler/state/v3/d1/miniflare-D1DatabaseObject/<uuid>.sqlite
  // The database name in wrangler.toml is "f1-versus-db" — find first match.
  // eslint-disable-next-line
  const fs = require("fs") as typeof import("fs");
  // eslint-disable-next-line
  const path = require("path") as typeof import("path");

  const base = path.join(process.cwd(), ".wrangler", "state", "v3", "d1");
  if (!fs.existsSync(base)) {
    throw new Error(
      `Local D1 state not found at ${base}. ` +
        "Run `wrangler d1 execute f1-versus-db --local --file=db/schema.sql` first."
    );
  }

  // Recurse to find *.sqlite
  function findSqlite(dir: string): string | null {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const found = findSqlite(path.join(dir, entry.name));
        if (found) return found;
      } else if (entry.name.endsWith(".sqlite") && !entry.name.endsWith("-shm") && !entry.name.endsWith("-wal")) {
        return path.join(dir, entry.name);
      }
    }
    return null;
  }

  const found = findSqlite(base);
  if (!found) {
    throw new Error(
      `No .sqlite file found under ${base}. ` +
        "Run `wrangler d1 execute f1-versus-db --local --file=db/schema.sql` first."
    );
  }
  return found;
}
