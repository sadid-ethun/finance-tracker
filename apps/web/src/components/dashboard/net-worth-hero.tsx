"use client";

import { useState } from "react";
import NumberFlow from "@number-flow/react";

import { SectionLabel } from "@/components/shared/card";
import { Area, AreaChart, YAxis } from "recharts";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import { Skeleton } from "@/components/shared/states";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  useNetWorthSeries,
  useTakeSnapshot,
  type DashboardSummary,
  type NetWorthRange,
} from "@/hooks/use-finance";
import { chartAnimation, chartConfig } from "@/lib/chart-theme";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

const RANGES: NetWorthRange[] = ["1m", "3m", "6m", "ytd", "1y", "all"];

/**
 * The headline. No card — it sits directly on the canvas so the number is the
 * largest thing on the page (PLAN.md section 21).
 */
/**
 * The chart needs two daily snapshots to draw a line, and the nightly job
 * only ever writes today — so a new install shows an empty frame for days
 * with no way to do anything about it.
 *
 * The backfill reconstructs history by walking transactions backwards from
 * current balances. It has existed, with a route and a hook, since the
 * dashboard was built; nothing ever called it. This is the trigger.
 *
 * It is approximate and says so: it can only see movements that produced a
 * transaction, so market moves on investments and any balance change without
 * one are invisible. It is the difference between a chart and a dot.
 */
function BuildHistory() {
  const snapshot = useTakeSnapshot();

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 rounded-card border border-dashed border-border px-4 text-center">
      <p className="text-[13px] text-muted-foreground">
        {snapshot.isSuccess
          ? "History rebuilt — the chart fills in further each night."
          : "Not enough history yet to draw a chart."}
      </p>
      {!snapshot.isSuccess ? (
        <button
          type="button"
          onClick={() => snapshot.mutate()}
          disabled={snapshot.isPending}
          className="rounded-[12px] border border-border px-3 py-1.5 text-[13px] font-medium transition-colors active:bg-secondary disabled:opacity-60 md:hover:bg-secondary"
        >
          {snapshot.isPending ? "Rebuilding…" : "Rebuild from my transactions"}
        </button>
      ) : null}
      {snapshot.isError ? (
        <p role="alert" className="text-[12px] text-negative">
          Could not rebuild. Try again.
        </p>
      ) : null}
    </div>
  );
}

export function NetWorthHero({ summary }: { summary: DashboardSummary | undefined }) {
  const [range, setRange] = useState<NetWorthRange>("6m");
  const series = useNetWorthSeries(range);

  const points = series.data ?? [];
  const change = summary?.net_worth_change ?? null;

  return (
    <section>
      {/* No refresh control here any more: pull down on touch, or use Refresh
          under Settings -> Data on desktop (IA_PLAN.md). */}
      <SectionLabel className="pt-2">Net worth</SectionLabel>

      {summary ? (
        <NumberFlow
          value={summary.net_worth / 100}
          format={{ style: "currency", currency: summary.currency, maximumFractionDigits: 2 }}
          className="tabular mt-1 block font-serif text-[40px] leading-none font-normal tracking-[-0.02em] sm:text-[48px]"
        />
      ) : (
        <Skeleton className="mt-2 h-[44px] w-56 sm:h-[52px]" />
      )}

      {change !== null && change !== 0 ? (
        <span
          className="mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
          style={{
            backgroundColor:
              change > 0
                ? "color-mix(in srgb, var(--positive) 14%, transparent)"
                : "color-mix(in srgb, var(--negative) 14%, transparent)",
            color: change > 0 ? "var(--positive)" : "var(--negative)",
          }}
        >
          {change > 0 ? (
            <ArrowUpRight className="size-3" />
          ) : (
            <ArrowDownRight className="size-3" />
          )}
          {formatMoney(Math.abs(change))} since last snapshot
        </span>
      ) : null}

      <div className="mt-4 h-[120px] w-full">
        {series.isLoading ? (
          <Skeleton className="h-full w-full" />
        ) : points.length < 2 ? (
          <BuildHistory />
        ) : (
          <ChartContainer config={chartConfig} className="size-full">
            <AreaChart data={points} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <defs>
                {/* Fades to transparent rather than to the canvas colour, so
                    the fill sits correctly on any surface it is placed on. */}
                <linearGradient id="nw-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                </linearGradient>
              </defs>
              {/* Domain follows the data: net worth rarely starts at zero, and
                  anchoring to zero would flatten every real movement. */}
              <YAxis hide domain={["dataMin", "dataMax"]} />
              <ChartTooltip
                cursor={{ stroke: "var(--border)" }}
                content={
                  <ChartTooltipContent
                    hideIndicator
                    labelKey="date"
                    formatter={(value) => (
                      <span className="tabular font-mono text-[13px]">
                        {formatMoney(Number(value))}
                      </span>
                    )}
                  />
                }
              />
              <Area
                type="monotone"
                dataKey="net_worth"
                stroke="var(--color-primary)"
                strokeWidth={2}
                fill="url(#nw-fill)"
                dot={false}
                {...chartAnimation()}
              />
            </AreaChart>
          </ChartContainer>
        )}
      </div>

      <div className="mt-3 flex gap-1 rounded-[14px] bg-secondary p-1">
        {RANGES.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRange(r)}
            aria-pressed={range === r}
            className={cn(
              "h-8 flex-1 rounded-[11px] text-[13px] font-medium uppercase transition-colors",
              range === r ? "bg-card shadow-sm" : "text-muted-foreground",
            )}
          >
            {r}
          </button>
        ))}
      </div>
    </section>
  );
}
