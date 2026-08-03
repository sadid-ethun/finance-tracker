"use client";

import nextDynamic from "next/dynamic";

import { RowSkeleton } from "@/components/shared/states";

/**
 * The transactions view reads filters from the URL. Server-rendering it means
 * suspending on useSearchParams, and that boundary does not resume after a hard
 * load — it stays on the fallback forever (soft navigation masks the bug).
 *
 * Rendering it client-only sidesteps that entirely. Nothing is lost: everything
 * under the app shell is per-user and client-fetched anyway, and the skeleton
 * shown here is the same one the list uses while loading.
 */
const TransactionsView = nextDynamic(
  () => import("./transactions-view").then((m) => m.TransactionsView),
  { ssr: false, loading: () => <RowSkeleton count={8} /> },
);

export function TransactionsBoundary() {
  return <TransactionsView />;
}
