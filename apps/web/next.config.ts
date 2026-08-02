import path from "node:path";
import type { NextConfig } from "next";

const repoRoot = path.resolve(import.meta.dirname, "../..");

const nextConfig: NextConfig = {
  // Emits a self-contained server bundle so the production image only needs
  // the Node runtime — see PLAN.md section 12.
  output: "standalone",
  // In a pnpm workspace, dependencies are symlinked into the repo-root store,
  // so file tracing has to start there or the standalone bundle loses packages.
  outputFileTracingRoot: repoRoot,
  turbopack: {
    // Next requires this to match outputFileTracingRoot.
    root: repoRoot,
  },
};

export default nextConfig;
