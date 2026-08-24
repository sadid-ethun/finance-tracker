"use client";

import { useState } from "react";
import NumberFlow from "@number-flow/react";
import { useQueryClient } from "@tanstack/react-query";

import { SectionLabel } from "@/components/shared/card";
import { Area, AreaChart, ResponsiveContainer, Tooltip, YAxis } from "recharts";
import { ArrowDownRight, ArrowUpRight, RefreshCw } from "lucide-react";

import { Skeleton } from "@/components/shared/states";
import {
  useNetWorthSeries,
  type DashboardSummary,
  type NetWorthRange,
} from "@/hooks/use-finance";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

const RANGES: NetWorthRange[] = ["1m", "3m", "6m", "1y", "all"];

/**
 * The headline. No card — it sits directly on the canvas so the number is the
 * largest thing on the page (PLAN.md section 21).
 */
/**
 * Refresh, in the same place and shape as the Investments header.
 *
 * Refetches every active query rather than the summary alone: the dashboard
 * is several independent cards, and updating one leaves the rest stale behind
 * a control that reads as "refresh this page".
 *
 * This is a client refetch, not a bank sync — the data it re-reads is
 * whatever the last sync wrote.
 */
function RefreshButton() {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  async function refresh() {
    setRefreshing(true);
    try {
      await queryClient.refetchQueries({ type: "active" });
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void refresh()}
      disabled={refreshing}
      aria-label="Refresh"
      className="rounded-[12px] border border-border p-2 text-muted-foreground transition-colors active:bg-secondary disabled:opacity-50 md:hover:text-foreground"
    >
      <RefreshCw className={cn("size-4", refreshing && "motion-safe:animate-spin")} />
    </button>
  );
}

export function NetWorthHero({ summary }: { summary: DashboardSummary | undefined }) {
  const [range, setRange] = useState<NetWorthRange>("6m");
  const series = useNetWorthSeries(range);

  const points = series.data ?? [];
  const change = summary?.net_worth_change ?? null;

  return (
    <section>
      <div className="flex items-start justify-between gap-3">
        <SectionLabel className="pt-2">Net worth</SectionLabel>
        <RefreshButton />
      </div>

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
          <div className="flex h-full items-center justify-center rounded-card border border-dashed border-border">
            <p className="px-4 text-center text-[13px] text-muted-foreground">
              Building your history — your chart fills in as we gather data.
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%" debounce={80}>
            <AreaChart data={points} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="nw-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                </linearGradient>
              </defs>
              {/* Domain follows the data: net worth rarely starts at zero, and
                  anchoring to zero would flatten every real movement. */}
              <YAxis hide domain={["dataMin", "dataMax"]} />
              <Tooltip
                cursor={{ stroke: "var(--border)" }}
                content={({ active, payload }) =>
                  active && payload?.length ? (
                    <div className="rounded-[12px] border border-border bg-card px-3 py-2 shadow-sm">
                      <p className="text-[11px] text-muted-foreground">
                        {payload[0].payload.date}
                      </p>
                      <p className="tabular text-[14px] font-semibold">
                        {formatMoney(Number(payload[0].value))}
                      </p>
                    </div>
                  ) : null
                }
              />
              <Area
                type="monotone"
                dataKey="net_worth"
                stroke="var(--primary)"
                strokeWidth={2}
                fill="url(#nw-fill)"
                isAnimationActive={false}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
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
