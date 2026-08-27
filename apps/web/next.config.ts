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
  experimental: {
    // Every page under (app) is force-dynamic, and the client router cache
    // holds a prefetched dynamic route for 0 seconds by default — so the tab
    // bar's `prefetch` was fetching payloads that were thrown away before the
    // tap that needed them. Thirty seconds is long enough to cover moving
    // between tabs and short enough that a stale shell is never on screen for
    // long; the data inside is TanStack's, on its own staleTime.
    staleTimes: { dynamic: 30, static: 180 },
  },
};

export default nextConfig;
