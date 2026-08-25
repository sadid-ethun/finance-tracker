"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { Card } from "@/components/shared/card";
import { cn } from "@/lib/utils";

/**
 * The refresh escape hatch.
 *
 * On a phone, pull-to-refresh is the gesture and there is no button. Desktop
 * has no such gesture, and once the header refresh icon gives way to the
 * settings gear there would otherwise be no way to refresh inside the app at
 * all — only a browser reload (IA_PLAN.md).
 *
 * Refetches every active query rather than one: several independent cards make
 * up a screen, and updating one leaves the rest stale behind a control that
 * reads as "refresh everything".
 *
 * This is a client refetch, not a bank sync. It re-reads whatever the last
 * sync wrote — pulling new transactions from a bank is per-connection, on
 * Accounts. Saying so here stops this reading as the button that failed to
 * fetch yesterday's purchases.
 */
export function RefreshData() {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [done, setDone] = useState(false);

  async function refresh() {
    setRefreshing(true);
    setDone(false);
    try {
      await queryClient.refetchQueries({ type: "active" });
      setDone(true);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <Card as="section" className="p-5">
      <h2 className="text-[16px] font-semibold">Refresh</h2>
      <p className="mt-0.5 text-[13px] text-muted-foreground">
        Re-reads your balances and transactions from the last sync. To pull new
        activity from a bank, sync that connection on Accounts.
      </p>
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={refreshing}
          className="inline-flex h-10 items-center gap-1.5 rounded-[14px] border border-border px-4 text-[14px] font-medium disabled:opacity-60"
        >
          <RefreshCw
            className={cn("size-4", refreshing && "motion-safe:animate-spin")}
          />
          {refreshing ? "Refreshing…" : "Refresh data"}
        </button>
        {done && !refreshing ? (
          <span role="status" className="text-[13px] text-muted-foreground">
            Up to date.
          </span>
        ) : null}
      </div>
    </Card>
  );
}
