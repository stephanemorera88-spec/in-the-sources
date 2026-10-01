/**
 * Applies db/schema.sql to DATABASE_URL (or to the local PGlite fallback when
 * DATABASE_URL is unset). Idempotent. Usage: `npm run migrate`.
 *
 * Env is loaded through @next/env so the same local env file next dev reads
 * works here without naming it on the command line.
 */
import { loadEnvConfig } from "@next/env";

async function main(): Promise<void> {
  // loadEnvConfig(dir, dev?): node_modules/@next/env/dist/index.d.ts
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

  // Imported after env is loaded so the db module sees DATABASE_URL.
  const { applySchema, closeDb, getDb } = await import("../src/lib/db/client");

  const target = process.env.DATABASE_URL?.trim() ? "DATABASE_URL" : "local PGlite fallback";
  await applySchema(getDb());
  await closeDb();
  console.log(`Schema applied (${target}).`);
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error("Migration failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
