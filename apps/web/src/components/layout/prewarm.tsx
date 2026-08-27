"use client";

import { useEffect, useState } from "react";

import {
  useAccounts,
  useBudget,
  useCashFlowSummary,
  useCashFlowTrends,
  useCategories,
  useDailySpend,
  useDashboardSummary,
  useHoldings,
  useInvestmentPerformance,
  useInvestmentSummary,
  useNetWorthSeries,
  useSpendingByCategory,
} from "@/hooks/use-finance";

/**
 * Warms every tab's data into the query cache so switching is instant.
 *
 * Marking the tab links `prefetch` was not enough on its own, for two reasons
 * that had to be fixed separately. The router cache held a prefetched dynamic
 * route for zero seconds, so those payloads were discarded before the tap that
 * needed them — `experimental.staleTimes` in next.config.ts is that half. This
 * is the other half, and the larger one: a route payload is only the shell.
 * Every figure on every screen is fetched on the client, so arriving with a
 * warm route and a cold cache still means a screen of skeletons.
 *
 * Mounting the hooks rather than calling `prefetchQuery` is deliberate. A
 * prefetch call would need its own copy of each key and fetcher, and the copy
 * that drifts is the one that silently stops warming anything. Here there is
 * one definition, and a wrong key cannot go unnoticed — it would break the
 * screen that uses it too.
 *
 * The parameters match each screen's defaults, because those are the requests
 * an arrival actually makes. A different range on arrival is a cache miss and
 * simply loads as it did before.
 */
function PrewarmQueries() {
  const month = currentMonth();

  // Shared / Accounts
  useDashboardSummary();
  useAccounts();
  useNetWorthSeries("6m");
  useCategories();

  // Spending
  useDailySpend(month);
  useBudget(month);
  useSpendingByCategory();

  // Cash Flow
  useCashFlowSummary(12);
  useCashFlowTrends(12);

  // Portfolio
  useInvestmentSummary();
  useHoldings();
  useInvestmentPerformance(180);

  return null;
}

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function Prewarm() {
  const [ready, setReady] = useState(false);

  // Deferred to idle. Firing a dozen requests during first paint would put the
  // screen you are actually looking at behind the four you are not.
  useEffect(() => {
    if (typeof window === "undefined") return;

    const idle = window.requestIdleCallback;
    if (idle) {
      const handle = idle(() => setReady(true), { timeout: 3000 });
      return () => window.cancelIdleCallback?.(handle);
    }

    // Safari has no requestIdleCallback.
    const timer = window.setTimeout(() => setReady(true), 1200);
    return () => window.clearTimeout(timer);
  }, []);

  return ready ? <PrewarmQueries /> : null;
}
