"use client";

import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";

import { useState } from "react";

import { Card, SectionLabel } from "@/components/shared/card";
import { Money } from "@/components/shared/money";
import { Skeleton } from "@/components/shared/states";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { useBudget, useDailySpend } from "@/hooks/use-finance";
import {
  axisProps,
  chartAnimation,
  chartConfig,
  formatAxisMoney,
  gridProps,
  niceTicks,
  referenceLineProps,
} from "@/lib/chart-theme";
import { formatMoney } from "@/lib/format";

/**
 * Spend this month, against budget, against another month.
 *
 * Cumulative spend by day for both months on one axis, with the budget as a
 * dashed threshold. The shape is the point: where the solid line sits
 * relative to the dashed one says whether this month is running ahead, and
 * where it crosses the threshold says when the budget ran out.
 *
 * Both months are plotted by day-of-month rather than by date, so a 28-day
 * February and a 31-day January line up at the same x. The comparison month
 * runs its full length while the current one stops at today — that gap is
 * what "we are only partway through" looks like.
 */
function LegendItem({
  colour,
  label,
  dashed = false,
}: {
  colour: string;
  label: string;
  dashed?: boolean;
}) {
  return (
    <span className="flex items-center gap-1.5 text-muted-foreground">
      {/* A dash for the threshold, a dot for a series: with both lines now
          solid, the shape is what says which one is not data. */}
      <span
        aria-hidden
        className={dashed ? "h-0 w-4 border-t border-dashed" : "size-2 rounded-full"}
        style={dashed ? { borderColor: colour } : { backgroundColor: colour }}
      />
      {label}
    </span>
  );
}

type SeriesPoint = { day: number; current: number | null; previous: number | null };

/**
 * Aligns two months on day-of-month.
 *
 * Both series are already cumulative from the API. The current month is
 * shorter — it stops at today — so its later days are null rather than zero:
 * a zero would draw the line back down to the axis and read as spending
 * reversed, where null simply ends it.
 */
function buildSeries(
  current: { date: string; cumulative: number }[],
  previous: { date: string; cumulative: number }[],
): SeriesPoint[] {
  const dayOf = (iso: string) => Number(iso.slice(8, 10));
  const currentBy = new Map(current.map((p) => [dayOf(p.date), p.cumulative]));
  const previousBy = new Map(previous.map((p) => [dayOf(p.date), p.cumulative]));

  const lastDay = Math.max(0, ...currentBy.keys(), ...previousBy.keys());

  return Array.from({ length: lastDay }, (_, i) => {
    const day = i + 1;
    return {
      day,
      current: currentBy.get(day) ?? null,
      previous: previousBy.get(day) ?? null,
    };
  });
}

/** Month name alone. The year is noise on a series label. */
function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short" });
}

/**
 * With the year, for the picker. Six months back from January reaches the
 * previous year, and two entries reading "Aug" would be indistinguishable.
 */
function pickerLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function SpendThisMonth({ month }: { month: string }) {
  /**
   * Comparison state lives here rather than with the caller. The card is now
   * on two screens, and a control that belongs to the card should not have to
   * be rebuilt by each page that renders it.
   */
  const [compareMonth, setCompareMonth] = useState(() => shiftMonth(month, -1));
  const compareOptions = Array.from({ length: 6 }, (_, i) => shiftMonth(month, -(i + 1)));
  const onCompareChange = setCompareMonth;
  const current = useBudget(month);
  const comparison = useBudget(compareMonth);
  const currentDaily = useDailySpend(month);
  const comparisonDaily = useDailySpend(compareMonth);

  const spent = current.data?.total_spent ?? 0;
  const budgeted = current.data?.total_budgeted ?? 0;
  const comparedSpent = comparison.data?.total_spent ?? 0;
  const comparisonHasData = (comparison.data?.total_spent ?? 0) > 0;

  const delta = spent - comparedSpent;

  /**
   * Keyed by day-of-month so a 28-day February aligns with a 31-day January.
   * Joining on date would put them on separate x positions and the two lines
   * would never be comparable.
   */
  const chartData = buildSeries(currentDaily.data ?? [], comparisonDaily.data ?? []);

  // Round ticks, so a label reading "$3k" is 3,000 exactly. The budget line
  // sitting just under it then reads as under budget, which it is.
  const ticks = niceTicks(
    Math.max(spent, comparedSpent, budgeted, ...chartData.map((p) => p.previous ?? 0)),
  );

  return (
    <Card as="section" className="p-5">
      <SectionLabel as="h2">Spend this month</SectionLabel>

      <div className="mt-3 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[13px] text-muted-foreground">Spending</p>
          {current.isLoading ? (
            <Skeleton className="mt-1 h-9 w-40" />
          ) : (
            <Money
              minorUnits={spent}
              className="mt-1 block font-serif text-[32px] leading-none font-normal tracking-[-0.02em]"
            />
          )}
        </div>

        <label className="shrink-0 text-right">
          <span className="block text-[12px] text-muted-foreground">Compare with</span>
          <select
            value={compareMonth}
            onChange={(event) => onCompareChange(event.target.value)}
            className="mt-1 rounded-full border border-border bg-transparent px-3 py-1.5 text-[13px] outline-none focus:border-ring"
          >
            {compareOptions.map((key) => (
              <option key={key} value={key}>
                {pickerLabel(key)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <ChartContainer config={chartConfig} className="mt-5 h-[180px] w-full">
        <ComposedChart data={chartData} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="day" {...axisProps} interval={6} tickMargin={8} />
          <YAxis
            {...axisProps}
            width={44}
            ticks={ticks}
            domain={[0, ticks[ticks.length - 1]]}
            tickFormatter={(value) => formatAxisMoney(Number(value))}
          />

          {/* Unlabelled: the legend below names it, and a second label on the
              line itself sat over the data it was meant to explain. */}
          {budgeted > 0 ? <ReferenceLine y={budgeted} {...referenceLineProps} /> : null}

          {/* Prior period first, so the current one draws over it. */}
          <Line
            type="monotone"
            dataKey="previous"
            stroke="var(--color-comparison)"
            strokeWidth={1.5}
            dot={false}
            connectNulls
            {...chartAnimation()}
          />
          <Line
            type="monotone"
            dataKey="current"
            stroke="var(--color-primary)"
            strokeWidth={2}
            dot={false}
            connectNulls
            {...chartAnimation()}
          />

          <ChartTooltip
            cursor={{ stroke: "var(--border)" }}
            content={
              <ChartTooltipContent
                // Read the day off the datum rather than the `label` argument.
                // ChartTooltipContent resolves that through the config, which
                // has no entry for the x key, so it arrived undefined and the
                // header read "Day undefined".
                labelFormatter={(_label, payload) => (
                  <span className="font-mono text-[11px] tracking-[0.08em] uppercase">
                    Day {String(payload?.[0]?.payload?.day ?? "")}
                  </span>
                )}
                formatter={(value, name) => (
                  <span className="flex w-full justify-between gap-3">
                    <span className="text-muted-foreground">
                      {name === "current" ? monthLabel(month) : monthLabel(compareMonth)}
                    </span>
                    <span className="tabular font-mono">{formatMoney(Number(value))}</span>
                  </span>
                )}
              />
            }
          />
        </ComposedChart>
      </ChartContainer>

      <div className="mt-3 flex flex-wrap justify-center gap-4 text-[12px]">
        <LegendItem colour={chartConfig.primary.color} label={monthLabel(month)} />
        <LegendItem colour={chartConfig.comparison.color} label={monthLabel(compareMonth)} />
        {budgeted > 0 ? (
          <LegendItem colour={referenceLineProps.stroke} label="Budget" dashed />
        ) : null}
      </div>

      {budgeted > 0 ? (
        <div className="mt-4 border-t border-border pt-3">
          <div className="flex items-baseline justify-between text-[13px]">
            <span className="text-muted-foreground">Budget</span>
            <Money minorUnits={budgeted} className="font-medium" />
          </div>
          {comparisonHasData ? (
            <p className="mt-1 text-[13px] text-muted-foreground">
              <Money minorUnits={Math.abs(delta)} className="font-medium" />{" "}
              {delta === 0 ? "the same as" : delta > 0 ? "more than" : "less than"}{" "}
              {monthLabel(compareMonth)}
            </p>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

