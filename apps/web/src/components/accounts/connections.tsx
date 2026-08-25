"use client";

import { AlertTriangle, Building2, Link2, RefreshCw, Trash2 } from "lucide-react";

import { Card, SectionLabel } from "@/components/shared/card";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState, RowSkeleton } from "@/components/shared/states";
import {
  usePlaidItems,
  useRemovePlaidItem,
  useSyncItem,
  useSyncRuns,
  type PlaidItem,
} from "@/hooks/use-finance";

import { ConnectBankButton } from "./connect-bank-button";

export function Connections() {
  const items = usePlaidItems();
  const runs = useSyncRuns();

  if (items.isLoading) return <RowSkeleton count={3} />;
  if (items.isError) return <ErrorState onRetry={() => void items.refetch()} />;

  const connections = items.data ?? [];

  return (
    <div className="space-y-8">
      <section>
        <div className="mb-3 flex items-center justify-between">
          <SectionLabel as="h2">
            Connected banks
          </SectionLabel>
          {connections.length > 0 ? <ConnectBankButton /> : null}
        </div>

        {connections.length === 0 ? (
          <EmptyState
            icon={Link2}
            title="No banks connected"
            description="Link an account to import balances and transactions automatically."
            action={<ConnectBankButton />}
          />
        ) : (
          <Card as="ul" className="divide-y divide-border overflow-hidden">
            {connections.map((item) => (
              <ConnectionRow key={item.id} item={item} />
            ))}
          </Card>
        )}
      </section>

      <section>
        <SectionLabel as="h2" className="mb-3">
          Recent syncs
        </SectionLabel>
        {runs.data && runs.data.length > 0 ? (
          <Card as="ul" className="divide-y divide-border overflow-hidden text-[13px]">
            {runs.data.map((run) => (
              <li key={run.id} className="flex items-center justify-between gap-3 p-3.5">
                <span className="min-w-0">
                  <span className="block font-medium">
                    {new Date(run.started_at).toLocaleString()}
                  </span>
                  <span className="text-muted-foreground">
                    {run.status === "error"
                      ? (run.error_code ?? "Failed")
                      : `+${run.added} added · ${run.modified} updated · ${run.removed} removed`}
                  </span>
                </span>
                <span
                  className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                  style={{
                    backgroundColor:
                      run.status === "error" ? "var(--negative)" : "var(--primary-soft)",
                    color:
                      run.status === "error"
                        ? "var(--destructive-foreground)"
                        : "var(--accent-foreground)",
                  }}
                >
                  {run.status}
                </span>
              </li>
            ))}
          </Card>
        ) : (
          <Card as="p" className="p-5 text-[14px] text-muted-foreground">
            No syncs yet.
          </Card>
        )}
      </section>
    </div>
  );
}

function ConnectionRow({ item }: { item: PlaidItem }) {
  const sync = useSyncItem();
  const remove = useRemovePlaidItem();
  const needsReauth =
    item.status === "login_required" || item.status === "pending_expiration";

  return (
    <li className="p-4">
      <div className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent">
          <Building2 className="size-4 text-accent-foreground" strokeWidth={2} />
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-medium">
            {item.institution_name ?? "Bank"}
          </span>
          <span className="block text-[13px] text-muted-foreground">
            {item.last_successful_sync_at
              ? `Updated ${new Date(item.last_successful_sync_at).toLocaleString()}`
              : "Never synced"}
          </span>
        </span>

        <button
          type="button"
          onClick={() => sync.mutate(item.id)}
          disabled={sync.isPending}
          aria-label={`Sync ${item.institution_name ?? "bank"}`}
          className="rounded-[10px] p-2 text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw className={sync.isPending ? "size-4 animate-spin" : "size-4"} />
        </button>

        <button
          type="button"
          onClick={() => remove.mutate(item.id)}
          disabled={remove.isPending}
          aria-label={`Disconnect ${item.institution_name ?? "bank"}`}
          className="rounded-[10px] p-2 text-muted-foreground hover:text-negative disabled:opacity-50"
        >
          <Trash2 className="size-4" />
        </button>
      </div>

      {needsReauth ? (
        <div
          className="mt-3 flex flex-wrap items-center gap-3 rounded-[14px] p-3"
          style={{ backgroundColor: "color-mix(in srgb, #c2a878 22%, transparent)" }}
        >
          <AlertTriangle className="size-4 shrink-0" strokeWidth={2} />
          <span className="flex-1 text-[13px] font-medium">
            {item.institution_name ?? "This bank"} needs to be reconnected.
          </span>
          {/* Update mode: re-authenticates in place rather than duplicating. */}
          <ConnectBankButton itemId={item.id} label="Reconnect" variant="subtle" />
        </div>
      ) : null}

      {item.status === "error" ? (
        <p className="mt-2 text-[13px] text-negative">
          Connection error{item.last_error_code ? ` (${item.last_error_code})` : ""}.
          Try disconnecting and adding it again.
        </p>
      ) : null}
    </li>
  );
}
