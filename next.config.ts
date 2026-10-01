import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native and WASM database drivers stay external to the server bundle.
  // serverExternalPackages: node_modules/next/dist/server/config-shared.d.ts line 1588.
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
};

export default nextConfig;
