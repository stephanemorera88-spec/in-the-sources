/**
 * Server-only guard (see SPEC.md, "Server-only guard").
 *
 * The `server-only` npm package throws at import time unless the bundler
 * resolves the `react-server` export condition, which `tsx` (used by
 * scripts/migrate.ts and scripts/seed.ts) and vitest do not. So server modules
 * import this file instead: it throws only when evaluated in a browser, which
 * is the case we care about (a client bundle pulling in db, crypto, keys).
 *
 * Usage, first line of every server module:
 *   import "@/lib/server-only";   (or the relative path "../server-only")
 */
if (typeof window !== "undefined") {
  throw new Error("server module imported in the browser");
}

export {};
