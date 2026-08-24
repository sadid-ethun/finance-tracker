"use client";

import { useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { RefreshCw, TrendingUp } from "lucide-react";

import { Card, SectionLabel } from "@/components/shared/card";
import { EmptyState } from "@/components/shared/empty-state";
import { Money } from "@/components/shared/money";
import { ErrorState, RowSkeleton, Skeleton } from "@/components/shared/states";
import {
  useAllocation,
  useHoldings,
  useInvestmentSummary,
  useSetCostBasis,
  useSyncInvestments,
  type HoldingRow,
} from "@/hooks/use-finance";
import { cn } from "@/lib/utils";

type GroupBy = "asset_class" | "account" | "security";

const GROUP_LABELS: Record<GroupBy, string> = {
  asset_class: "Asset class",
  account: "Account",
  security: "Holding",
};

export function InvestmentsView() {
  const summary = useInvestmentSummary();
  const holdings = useHoldings();
  const sync = useSyncInvestments();
  const [groupBy, setGroupBy] = useState<GroupBy>("asset_class");
  const allocation = useAllocation(groupBy);

  if (summary.isError) {
    return <ErrorState onRetry={() => void summary.refetch()} />;
  }

  if (summary.data && summary.data.holdings_count === 0) {
    return (
      <EmptyState
        icon={TrendingUp}
        title="No investment accounts"
        description="Connect a brokerage to track holdings, allocation, and performance."
        action={
          <button
            type="button"
            onClick={() => sync.mutate()}
            disabled={sync.isPending}
            className="inline-flex h-10 items-center gap-1.5 rounded-[14px] border border-border px-4 text-[14px] font-medium disabled:opacity-60"
          >
            <RefreshCw className={cn("size-4", sync.isPending && "animate-spin")} />
            {sync.isPending ? "Syncing…" : "Sync investments"}
          </button>
        }
      />
    );
  }

  return (
    <div className="space-y-8">
      <section>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[13px] font-medium text-muted-foreground">
              Portfolio value
            </p>
            {summary.data ? (
              <Money
                minorUnits={summary.data.total_value}
                currency={summary.data.currency}
                className="mt-1 block text-[36px] leading-none font-semibold tracking-[-0.03em]"
              />
            ) : (
              <Skeleton className="mt-2 h-9 w-48" />
            )}
          </div>
          <button
            type="button"
            onClick={() => sync.mutate()}
            disabled={sync.isPending}
            aria-label="Sync investments"
            className="rounded-[12px] border border-border p-2 text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw className={cn("size-4", sync.isPending && "animate-spin")} />
          </button>
        </div>

        {summary.data ? (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Card className="p-4">
              <p className="text-[13px] text-muted-foreground">Unrealized gain</p>
              <Money
                minorUnits={summary.data.total_gain}
                colored
                signed
                className="mt-0.5 block text-[18px] font-semibold"
              />
              {summary.data.total_gain_percent !== null ? (
                <p className="tabular mt-0.5 text-[12px] text-muted-foreground">
                  {summary.data.total_gain_percent > 0 ? "+" : ""}
                  {summary.data.total_gain_percent}%
                </p>
              ) : null}
            </Card>
            <Card className="p-4">
              <p className="text-[13px] text-muted-foreground">Cost basis</p>
              <Money
                minorUnits={summary.data.total_cost_basis}
                className="mt-0.5 block text-[18px] font-semibold"
              />
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                {summary.data.holdings_count - summary.data.positions_without_cost_basis} of{" "}
                {summary.data.holdings_count} position
                {summary.data.holdings_count === 1 ? "" : "s"}
              </p>
            </Card>
          </div>
        ) : null}

        {summary.data && summary.data.positions_without_cost_basis > 0 ? (
          <p className="mt-3 text-[12px] text-muted-foreground">
            Unrealized only: what your current positions are worth versus what
            they cost. It excludes gains you have already realised by selling,
            dividends, interest, and account bonuses — so it will not match an
            all-time return figure from your broker. Measured against{" "}
            <Money
              minorUnits={summary.data.invested_value}
              currency={summary.data.currency}
              className="font-medium"
            />{" "}
            of holdings. The other {summary.data.positions_without_cost_basis} position
            {summary.data.positions_without_cost_basis === 1 ? "" : "s"} —{" "}
            <Money
              minorUnits={summary.data.total_value - summary.data.invested_value}
              currency={summary.data.currency}
              className="font-medium"
            />
            , typically cash and margin — {summary.data.positions_without_cost_basis === 1 ? "has" : "have"} no
            cost basis from your institution, so {summary.data.positions_without_cost_basis === 1 ? "it is" : "they are"} excluded.
          </p>
        ) : null}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <SectionLabel as="h2">Allocation</SectionLabel>
          <div className="flex gap-1 rounded-[12px] bg-secondary p-1">
            {(Object.keys(GROUP_LABELS) as GroupBy[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setGroupBy(key)}
                aria-pressed={groupBy === key}
                className={cn(
                  "h-7 rounded-[9px] px-2.5 text-[12px] font-medium",
                  groupBy === key ? "bg-card shadow-sm" : "text-muted-foreground",
                )}
              >
                {GROUP_LABELS[key]}
              </button>
            ))}
          </div>
        </div>

        <Card className="p-5">
          {allocation.isLoading ? (
            <Skeleton className="h-[180px] w-full" />
          ) : (allocation.data ?? []).length === 0 ? (
            <p className="py-6 text-center text-[14px] text-muted-foreground">
              Nothing to allocate yet.
            </p>
          ) : (
            <div className="flex flex-col items-center gap-5 sm:flex-row">
              <div className="size-[160px] shrink-0">
                <ResponsiveContainer width="100%" height="100%" debounce={80}>
                  <PieChart>
                    <Pie
                      data={allocation.data}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={54}
                      outerRadius={78}
                      paddingAngle={2}
                      stroke="none"
                      isAnimationActive={false}
                    >
                      {(allocation.data ?? []).map((slice) => (
                        <Cell key={slice.name} fill={slice.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="w-full flex-1 space-y-2">
                {(allocation.data ?? []).slice(0, 6).map((slice) => (
                  <li key={slice.name} className="flex items-center gap-2.5">
                    <span
                      aria-hidden
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: slice.color }}
                    />
                    <span className="min-w-0 flex-1 truncate text-[14px]">
                      {slice.name}
                    </span>
                    <Money minorUnits={slice.value} className="text-[14px] font-medium" />
                    <span className="tabular w-12 text-right text-[12px] text-muted-foreground">
                      {slice.percent}%
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </section>

      <section>
        <SectionLabel as="h2" className="mb-3">Holdings</SectionLabel>
        {holdings.isLoading ? (
          <RowSkeleton count={5} />
        ) : (
          <Card as="ul" className="divide-y divide-border overflow-hidden">
            {(holdings.data ?? []).map((h) => (
              <HoldingRowItem key={h.id} holding={h} />
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}

function HoldingRowItem({ holding }: { holding: HoldingRow }) {
  const [editing, setEditing] = useState(false);
  // Dollars in the input, minor units on the wire — the user types 1791.10,
  // the API stores 179110.
  const [draft, setDraft] = useState(() =>
    holding.cost_basis !== null ? (holding.cost_basis / 100).toFixed(2) : "",
  );
  const setCostBasis = useSetCostBasis();

  function save(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = draft.trim();
    // Empty clears the override and falls back to whatever Plaid reports.
    const parsed = trimmed === "" ? null : Math.round(Number(trimmed) * 100);
    if (parsed !== null && !Number.isFinite(parsed)) return;
    setCostBasis.mutate(
      { id: holding.id, costBasis: parsed },
      { onSuccess: () => setEditing(false) },
    );
  }

  return (
    <li className="flex items-center gap-3 p-4">
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          {holding.ticker ? (
            <span className="tabular rounded-[6px] bg-secondary px-1.5 py-0.5 text-[11px] font-semibold">
              {holding.ticker}
            </span>
          ) : null}
          <span className="truncate text-[15px] font-medium">{holding.name}</span>
        </span>
        <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">
          {/* Quantity arrives as a string so fractional shares keep precision. */}
          {Number(holding.quantity).toLocaleString(undefined, {
            maximumFractionDigits: 6,
          })}{" "}
          · {holding.account_name}
        </span>
      </span>

      <span className="text-right">
        <Money
          minorUnits={holding.value}
          currency={holding.currency}
          className="block text-[15px] font-semibold"
        />
        {holding.gain !== null ? (
          <Money
            minorUnits={holding.gain}
            colored
            signed
            className="block text-[12px]"
          />
        ) : (
          <span className="block text-[12px] text-muted-foreground">no basis</span>
        )}

        {editing ? (
          <form onSubmit={save} className="mt-1.5 flex items-center gap-1.5">
            <input
              inputMode="decimal"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Total cost"
              aria-label={`Cost basis for ${holding.name}`}
              autoFocus
              className="tabular h-8 w-28 rounded-[10px] border border-input bg-background px-2 text-right text-[13px] outline-none focus:border-ring"
            />
            <button
              type="submit"
              disabled={setCostBasis.isPending}
              className="h-8 rounded-[10px] bg-primary px-2.5 text-[12px] font-semibold text-primary-foreground disabled:opacity-60"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="h-8 rounded-[10px] border border-border px-2 text-[12px]"
            >
              Cancel
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="mt-0.5 text-[11px] text-muted-foreground underline decoration-dotted underline-offset-2"
          >
            {holding.cost_basis_is_override ? "basis edited" : "edit basis"}
          </button>
        )}
      </span>
    </li>
  );
}
