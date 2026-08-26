"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import { ChartPie, ChevronRight } from "lucide-react";

import { MonthCard } from "@/components/dashboard/stat-tiles";
import { Card, SectionLabel } from "@/components/shared/card";
import { EmptyState } from "@/components/shared/empty-state";
import { Money } from "@/components/shared/money";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { ErrorState, Skeleton } from "@/components/shared/states";
import {
  cashFlowWindow,
  useCashFlowByCategory,
  useCashFlowSummary,
  useCashFlowTrends,
  useDashboardSummary,
} from "@/hooks/use-finance";
import {
  axisProps,
  chartAnimation,
  chartConfig,
  formatAxisMoney,
  gridProps,
  symmetricTicks,
} from "@/lib/chart-theme";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

type RangeKey = "6m" | "12m" | "ytd" | "24m";

const RANGES: { key: RangeKey; label: string }[] = [
  { key: "6m", label: "6 months" },
  { key: "12m", label: "12 months" },
  { key: "ytd", label: "YTD" },
  { key: "24m", label: "24 months" },
];

/**
 * YTD as a month count: January through the current month inclusive.
 *
 * No API change needed — the cash-flow endpoints already take a number of
 * months, and "this year so far" is one of them. Recomputed per render rather
 * than held in a constant, so a session open across midnight on 1 January
 * does not keep reporting the old year.
 */
function monthsFor(range: RangeKey): number {
  switch (range) {
    case "6m":
      return 6;
    case "12m":
      return 12;
    case "24m":
      return 24;
    case "ytd":
      return new Date().getMonth() + 1;
  }
}

export function CashFlowView() {
  /**
   * Selected by key, not by month count. YTD resolves to a number of months
   * that can equal one of the fixed options — in June it is 6 — and keying on
   * the number would light both buttons.
   */
  const [range, setRange] = useState<RangeKey>("12m");
  const months = monthsFor(range);
  const summary = useCashFlowSummary(months);
  const dashboard = useDashboardSummary();
  const trends = useCashFlowTrends(months);
  // Income only. The spending side of this breakdown duplicated the one on
  // Spending, which owns money going out; income appears nowhere else in the
  // app, so this is the half worth keeping (IA_PLAN.md).
  //
  // Same window as the charts above, so a row's transaction count matches the
  // list it opens.
  const byCategory = useCashFlowByCategory("income", months);

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
      {/* Always the current month, and the only thing on this screen the range
          switcher does not touch — so it leads, above everything the switcher
          governs. Money in against money out is this tab's subject, which is
          why the card lives here and not on Spending (IA_PLAN.md). */}
      <MonthCard summary={dashboard.data} />

      <section>
        <SectionLabel as="h2" className="mb-3">Trend</SectionLabel>
        <Card className="p-5">
          {trends.isLoading ? (
            <Skeleton className="h-[220px] w-full" />
          ) : (
            <div className="h-[220px] w-full">
              <ChartContainer config={chartConfig} className="size-full">
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
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="label" {...axisProps} />
                  <YAxis
                    {...axisProps}
                    width={44}
                    tickFormatter={(value) => formatAxisMoney(Number(value))}
                    ticks={symmetricTicks(trends.data ?? [])}
                  />
                  {/* Solid, against the dashed grid, so the line dividing
                      income from spending is not mistaken for a rule. */}
                  <ReferenceLine y={0} stroke="var(--border)" strokeWidth={1} />
                  <ChartTooltip
                    cursor={{ fill: "var(--secondary)", opacity: 0.4 }}
                    content={
                      <ChartTooltipContent
                        formatter={(value, name) => (
                          <span className="flex w-full justify-between gap-3">
                            <span className="text-muted-foreground">
                              {name === "income"
                                ? "Income"
                                : name === "net"
                                  ? "Net"
                                  : "Spending"}
                            </span>
                            <span className="tabular font-mono">
                              {formatMoney(Math.abs(Number(value)))}
                            </span>
                          </span>
                        )}
                      />
                    }
                  />
                  <Bar
                    dataKey="income"
                    fill="var(--color-income)"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={18}
                    {...chartAnimation()}
                  />
                  <Bar
                    dataKey="spendingDown"
                    fill="var(--color-spending)"
                    // Same order as the upward bar: Recharts mirrors the
                    // radius for a negative value, so [0,0,4,4] rounds the
                    // baseline end and squares the tip — backwards.
                    radius={[4, 4, 0, 0]}
                    maxBarSize={18}
                    {...chartAnimation()}
                  />
                  {/* Net over the bars, in the data accent, so the trend reads
                      across months the bars only describe individually. */}
                  <Line
                    type="monotone"
                    dataKey="net"
                    stroke="var(--color-primary)"
                    strokeWidth={2}
                    dot={false}
                    {...chartAnimation()}
                  />
                </ComposedChart>
              </ChartContainer>
            </div>
          )}
          <div className="mt-3 flex flex-wrap justify-center gap-4 text-[12px]">
            <Legend color={chartConfig.income.color} label="Income" />
            <Legend color={chartConfig.spending.color} label="Spending" />
            {/* --primary is the white CTA fill; the line is the data accent. */}
            <Legend color={chartConfig.primary.color} label="Net" />
          </div>
        </Card>
      </section>

      {/* Under the chart it drives, not above it — the same order as the net
          worth chart on Accounts, and the one people know from every brokerage
          app. The averages below move with it too. */}
      <div className="flex gap-1 rounded-[14px] bg-secondary p-1">
        {RANGES.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => setRange(option.key)}
            aria-pressed={range === option.key}
            className={cn(
              "h-8 flex-1 rounded-[11px] text-[13px] font-medium",
              range === option.key ? "bg-card" : "text-muted-foreground",
            )}
          >
            {option.label}
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
        <SectionLabel as="h2" className="mb-3">
          Income by category
        </SectionLabel>

        {byCategory.isLoading ? (
          <Skeleton className="h-[200px] rounded-card" />
        ) : (byCategory.data ?? []).length === 0 ? (
          <Card as="p" className="p-5 text-[14px] text-muted-foreground">
            No income recorded in this window.
          </Card>
        ) : (
          <Card as="ul" className="divide-y divide-border overflow-hidden">
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
          </Card>
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
