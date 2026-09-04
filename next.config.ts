import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["@libsql/client", "sharp"],
  // `next dev` would otherwise append its own block to CLAUDE.md
  agentRules: false,
};

export default nextConfig;
