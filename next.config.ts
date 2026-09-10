import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["@libsql/client", "sharp"],
  // `next dev` would otherwise append its own block to CLAUDE.md
  agentRules: false,
  // a dev `./data` folder (photos, db) must never be traced into .next/standalone
  outputFileTracingExcludes: { "*": ["./data/**"] },
  // `/ayuda` became `/ajustes` (#148). The bookmarklet instructions are printed in the scripts'
  // README and sitting in whatever the family bookmarked, so the old address keeps working.
  redirects: async () => [{ source: "/ayuda", destination: "/ajustes", permanent: true }],
};

export default nextConfig;
