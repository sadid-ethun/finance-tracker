"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  ComposedChart,
  ResponsiveContainer,
  XAxis,
} from "recharts";
import { ChartPie, ChevronRight } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { Money } from "@/components/shared/money";
import { ErrorState, Skeleton } from "@/components/shared/states";
import {
  cashFlowWindow,
  useCashFlowByCategory,
  useCashFlowSummary,
  useCashFlowTrends,
} from "@/hooks/use-finance";
import { cn } from "@/lib/utils";

export function CashFlowView() {
  const [months, setMonths] = useState(12);
  const summary = useCashFlowSummary(months);
  const trends = useCashFlowTrends(months);
  const [kind, setKind] = useState<"expense" | "income">("expense");
  // Same window as the charts above, so a row's transaction count matches the
  // list it opens.
  const byCategory = useCashFlowByCategory(kind, months);

  if (summary.isError) return <ErrorState onRetry={() => void summary.refetch()} />;

  const hasData =
    summary.data && (summary.data.total_income > 0 || summary.data.total_spending > 0);

  if (summary.data && !hasData) {
    return (
      <EmptyState
        icon={ChartPie}
        title="No cash flow yet"
        description="Once transactions exist, your monthly income and spending appear here."
      />
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex gap-1 rounded-[14px] bg-secondary p-1">
        {[6, 12, 24].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setMonths(n)}
            aria-pressed={months === n}
            className={cn(
              "h-8 flex-1 rounded-[11px] text-[13px] font-medium",
              months === n ? "bg-card shadow-sm" : "text-muted-foreground",
            )}
          >
            {n} months
          </button>
        ))}
      </div>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Avg income" value={summary.data?.average_income} />
        <Stat label="Avg spending" value={summary.data?.average_spending} />
        <Stat
          label="Avg net"
          value={summary.data?.average_net}
          colored
          className="col-span-2 sm:col-span-1"
        />
      </section>

      <section>
        <h2 className="mb-3 text-[18px] font-semibold tracking-[-0.01em]">Trend</h2>
        <div className="rounded-card border border-border bg-card p-5">
          {trends.isLoading ? (
            <Skeleton className="h-[220px] w-full" />
          ) : (
            <div className="h-[220px] w-full">
              <ResponsiveContainer width="100%" height="100%" debounce={80}>
                <ComposedChart
                  data={(trends.data ?? []).map((t) => ({
                    ...t,
                    spendingDown: -t.spending,
                    label: new Date(`${t.month}T00:00:00`).toLocaleDateString("en-US", {
                      month: "short",
                    }),
                  }))}
                  margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
                >
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis
                    dataKey="label"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  />
                  <Bar
                    dataKey="income"
                    fill="var(--positive)"
                    radius={[4, 4, 0, 0]}
                    isAnimationActive={false}
                  />
                  <Bar
                    dataKey="spendingDown"
                    fill="var(--negative)"
                    radius={[0, 0, 4, 4]}
                    isAnimationActive={false}
                  />
                  {/* Rolling average smooths months distorted by one large charge. */}
                  <Line
                    type="monotone"
                    dataKey="net"
                    stroke="var(--primary)"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="mt-3 flex flex-wrap justify-center gap-4 border-t border-border pt-3 text-[12px]">
            <Legend color="var(--positive)" label="Income" />
            <Legend color="var(--negative)" label="Spending" />
            <Legend color="var(--primary)" label="Net" />
          </div>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[18px] font-semibold tracking-[-0.01em]">
            Largest categories
          </h2>
          <div className="flex gap-1 rounded-[12px] bg-secondary p-1">
            {(["expense", "income"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                aria-pressed={kind === k}
                className={cn(
                  "h-7 rounded-[9px] px-2.5 text-[12px] font-medium capitalize",
                  kind === k ? "bg-card shadow-sm" : "text-muted-foreground",
                )}
              >
                {k}
              </button>
            ))}
          </div>
        </div>

        {byCategory.isLoading ? (
          <Skeleton className="h-[200px] rounded-card" />
        ) : (byCategory.data ?? []).length === 0 ? (
          <p className="rounded-card border border-border bg-card p-5 text-[14px] text-muted-foreground">
            No {kind} recorded in this window.
          </p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-card">
            {(byCategory.data ?? []).map((row) => (
              <li key={row.category_id ?? row.name}>
                <Link
                  href={categoryHref(row.category_id, months)}
                  className="flex items-center gap-3 p-4 transition-colors hover:bg-secondary active:bg-secondary"
                >
                  <span
                    aria-hidden
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: row.color ?? "var(--muted-foreground)" }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px]">{row.name}</span>
                    <span className="block text-[12px] text-muted-foreground">
                      {row.transaction_count} transaction
                      {row.transaction_count === 1 ? "" : "s"}
                    </span>
                  </span>
                  <Money minorUnits={row.amount} className="text-[15px] font-semibold" />
                  <ChevronRight
                    aria-hidden
                    className="size-4 shrink-0 text-muted-foreground"
                    strokeWidth={2}
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/**
 * Where a category row goes.
 *
 * Carries the same window the totals were computed over, so the list opens
 * showing the transactions behind the number that was clicked rather than
 * whatever the transactions page last defaulted to.
 *
 * Rows with no category id are the uncategorized bucket, which is a separate
 * filter rather than a category to select.
 */
function categoryHref(categoryId: string | null, months: number): string {
  const { from, to } = cashFlowWindow(months);
  const params = new URLSearchParams({ from, to });
  if (categoryId) params.set("categories", categoryId);
  else params.set("uncategorized", "true");
  return `/transactions?${params.toString()}`;
}

function Stat({
  label,
  value,
  colored = false,
  className,
}: {
  label: string;
  value: number | undefined;
  colored?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("rounded-card border border-border bg-card p-4", className)}>
      <p className="text-[13px] text-muted-foreground">{label}</p>
      {value === undefined ? (
        <Skeleton className="mt-1 h-6 w-20" />
      ) : (
        <Money
          minorUnits={value}
          colored={colored}
          signed={colored}
          className="mt-0.5 block text-[18px] font-semibold"
        />
      )}
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        aria-hidden
        className="size-2 rounded-full"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}

export { BarChart };
