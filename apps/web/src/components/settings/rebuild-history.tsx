"use client";

import { History } from "lucide-react";

import { Card } from "@/components/shared/card";
import { useTakeSnapshot } from "@/hooks/use-finance";
import { cn } from "@/lib/utils";

/**
 * Reconstruct net-worth history from transactions.
 *
 * The same action the net-worth chart offers when it has too few points to
 * draw — but that one is gated on the chart being empty, which is exactly when
 * it is least needed. Rebuilding is what you reach for after removing bad
 * history, and at that moment the chart usually still has points in it.
 *
 * Only fills gaps: days that already have a snapshot are left alone, so this
 * cannot overwrite an accurate figure with an approximate one. The corollary
 * is that repairing a wrong day means deleting it first — the button will not
 * do it for you.
 */
export function RebuildHistory() {
  const snapshot = useTakeSnapshot();

  return (
    <Card as="section" className="p-5">
      <h2 className="text-[16px] font-semibold">Rebuild net worth history</h2>
      <p className="mt-0.5 text-[13px] text-muted-foreground">
        Reconstructs missing days by walking your transactions back from today&apos;s
        balances. Approximate: a market move leaves no transaction, so it cannot
        be seen. Days that already have a figure are left as they are.
      </p>
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => snapshot.mutate()}
          disabled={snapshot.isPending}
          className="inline-flex h-10 items-center gap-1.5 rounded-[14px] border border-border px-4 text-[14px] font-medium disabled:opacity-60"
        >
          <History className={cn("size-4", snapshot.isPending && "animate-spin")} />
          {snapshot.isPending ? "Rebuilding…" : "Rebuild"}
        </button>
        {snapshot.isSuccess && !snapshot.isPending ? (
          <span role="status" className="text-[13px] text-muted-foreground">
            {snapshot.data.backfilled > 0
              ? `Filled ${snapshot.data.backfilled} day${snapshot.data.backfilled === 1 ? "" : "s"}.`
              : "Nothing missing."}
          </span>
        ) : null}
      </div>
      {snapshot.isError ? (
        <p role="alert" className="mt-2 text-[13px] text-negative">
          Could not rebuild. Try again.
        </p>
      ) : null}
    </Card>
  );
}
