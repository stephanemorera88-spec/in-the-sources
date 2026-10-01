/*
 * Test-only helper: an in-memory PGlite database with db/schema.sql applied,
 * injected through setDbForTests. Imported by *.test.ts files only; never
 * import it from app code (it would pull the WASM runtime into the bundle).
 */
import { PGlite } from "@electric-sql/pglite";
import { applySchema, setDbForTests } from "./client";

export async function createTestDb(): Promise<PGlite> {
  // constructor(dataDir?, options?): no dataDir means in-memory
  // (node_modules/@electric-sql/pglite/dist/pglite-BdeXTuy6.d.ts line 954).
  const db = new PGlite();
  await db.waitReady;
  await applySchema(db); // PGlite exposes exec(), so the multi-statement file applies as-is
  setDbForTests(db);
  return db;
}

/** A valid 64-hex KEY_ENCRYPTION_SECRET for tests. Not a real secret. */
export const TEST_KEY_ENCRYPTION_SECRET = "0123456789abcdef".repeat(4);
