/**
 * Creates a `dev` license for SEED_EMAIL (default stephane@evoix.io) and
 * prints the key once. The key is never stored in plaintext, so copy it from
 * the terminal. Usage: `npm run seed`.
 */
import { loadEnvConfig } from "@next/env";

async function main(): Promise<void> {
  // loadEnvConfig(dir, dev?): node_modules/@next/env/dist/index.d.ts
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

  // Imported after env is loaded so the db module sees DATABASE_URL.
  const { applySchema, closeDb, getDb } = await import("../src/lib/db/client");
  const { createLicense } = await import("../src/lib/db");

  const email = process.env.SEED_EMAIL?.trim() || "stephane@evoix.io";

  await applySchema(getDb()); // idempotent, so a fresh database works too
  const { license, key } = await createLicense({ email, plan: "dev" });
  await closeDb();

  console.log(`Created dev license ${license.id} for ${email}.`);
  console.log("License key (shown once, not stored in plaintext):");
  console.log(key);
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error("Seed failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
