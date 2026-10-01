import "../server-only";
import fs from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import type { PGlite } from "@electric-sql/pglite";

/**
 * Minimal query surface shared by pg and PGlite, so the data layer and its
 * tests are written once. Tests inject a PGlite instance via setDbForTests.
 *
 * `exec` is optional and only used for multi-statement scripts (the schema).
 * pg runs a param-less `query` through the simple protocol, which already
 * accepts several statements; a PGlite instance exposes `exec` for that.
 */
export interface Queryable {
  query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  exec?(text: string): Promise<unknown>;
}

/** Local fallback database folder (git-ignored). */
export const PGLITE_DATA_DIR = path.resolve(process.cwd(), ".pglite-data");

const SCHEMA_PATH = path.resolve(process.cwd(), "db", "schema.sql");

type DbState = {
  instance: Queryable | null;
  override: Queryable | null;
  close: (() => Promise<void>) | null;
};

/* Cached on globalThis so Next dev HMR does not open a second PGlite handle
   on the same data folder (two handles on one folder corrupt it). */
const globalForDb = globalThis as unknown as { __itsDbState?: DbState };
const state: DbState = globalForDb.__itsDbState ?? { instance: null, override: null, close: null };
globalForDb.__itsDbState = state;

export function readSchemaSql(): string {
  return fs.readFileSync(SCHEMA_PATH, "utf8");
}

/** Applies db/schema.sql (idempotent: every statement is IF NOT EXISTS). */
export async function applySchema(q: Queryable): Promise<void> {
  const sql = readSchemaSql();
  if (q.exec) {
    await q.exec(sql);
  } else {
    await q.query(sql);
  }
}

/** Tests inject their own database (an in-memory PGlite works as-is). */
export function setDbForTests(q: Queryable): void {
  state.override = q;
}

export function getDb(): Queryable {
  if (state.override) return state.override;
  if (state.instance) return state.instance;

  const url = process.env.DATABASE_URL?.trim();
  if (url) {
    state.instance = createPgQueryable(url);
    return state.instance;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "DATABASE_URL is not set. In the Sources needs a Postgres connection string in production; set DATABASE_URL in the Vercel project environment."
    );
  }

  state.instance = createPgliteQueryable(PGLITE_DATA_DIR);
  return state.instance;
}

/** Closes the pool or the PGlite handle. Scripts call this before exiting. */
export async function closeDb(): Promise<void> {
  const close = state.close;
  state.instance = null;
  state.close = null;
  if (close) await close();
}

function createPgQueryable(connStr: string): Queryable {
  // sslmode=verify-full set explicitly, copied from the site's audit/db.ts:
  // it avoids the pg deprecation warning and verifies the server certificate.
  const url = connStr.includes("sslmode=")
    ? connStr.replace(/sslmode=[^&]+/, "sslmode=verify-full")
    : connStr + (connStr.includes("?") ? "&" : "?") + "sslmode=verify-full";
  // PoolConfig.connectionString and .max: node_modules/@types/pg/index.d.ts lines 18 and 51.
  const pool = new Pool({ connectionString: url, max: 5 });
  state.close = () => pool.end();
  return {
    async query(text, params) {
      // Pool.query(queryText, values): node_modules/@types/pg/index.d.ts line 231;
      // QueryResult.rows: line 105. With no values pg uses the simple protocol.
      const result = await pool.query<Record<string, unknown>>(text, params as unknown[] | undefined);
      return { rows: result.rows };
    },
  };
}

function createPgliteQueryable(dataDir: string): Queryable {
  let ready: Promise<PGlite> | null = null;

  const init = (): Promise<PGlite> => {
    if (!ready) {
      ready = (async () => {
        console.warn(`[db] DATABASE_URL is not set; using the local PGlite fallback at ${dataDir} (development only).`);
        // Loaded lazily so the production bundle never evaluates the WASM runtime.
        const { PGlite } = await import("@electric-sql/pglite");
        // constructor(dataDir?: string, options?): node_modules/@electric-sql/pglite/dist/pglite-BdeXTuy6.d.ts line 954.
        const db = new PGlite(dataDir);
        await db.waitReady; // line 934
        await db.exec(readSchemaSql()); // exec(query): line 902, multi-statement
        state.close = () => db.close(); // line 996
        return db;
      })();
    }
    return ready;
  };

  return {
    async query(text, params) {
      const db = await init();
      // query<T>(query, params?): pglite-BdeXTuy6.d.ts line 877; Results.rows: line 549.
      const result = await db.query<Record<string, unknown>>(text, params as unknown[] | undefined);
      return { rows: result.rows };
    },
    async exec(text) {
      const db = await init();
      return db.exec(text);
    },
  };
}
