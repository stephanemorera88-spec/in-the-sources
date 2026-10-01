import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native and WASM database drivers stay external to the server bundle.
  // serverExternalPackages: node_modules/next/dist/server/config-shared.d.ts line 1588.
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  // db/schema.sql is read with fs at runtime (self-migration on the first
  // query); trace it into every serverless function so Vercel ships it.
  // Global '/*' key: node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/output.md.
  outputFileTracingIncludes: {
    "/*": ["db/schema.sql"],
  },
};

export default nextConfig;
