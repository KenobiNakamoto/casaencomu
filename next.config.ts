import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["@libsql/client", "sharp"],
  // `next dev` would otherwise append its own block to CLAUDE.md
  agentRules: false,
  // a dev `./data` folder (photos, db) must never be traced into .next/standalone
  outputFileTracingExcludes: { "*": ["./data/**"] },
};

export default nextConfig;
