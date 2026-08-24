"use client";

import { Card, SectionLabel } from "@/components/shared/card";
import { Money } from "@/components/shared/money";
import { Skeleton } from "@/components/shared/states";
import { useBudget } from "@/hooks/use-finance";
import { cn } from "@/lib/utils";

/**
 * Spend this month, against budget, against another month.
 *
 * Borrows the structure of the reference's spend card: a mono section label,
 * one large figure, an explicit comparison control, and a plot with the
 * budget drawn as a reference the bars are read against.
 *
 * It is not the reference's chart. That one is cumulative spend by day, and
 * no endpoint in this app exposes daily granularity — `/budgets/{month}`
 * returns month totals and per-category lines, and nothing else has a daily
 * series. Drawing it would mean a new API endpoint, which this pass is not
 * allowed to add. Two months read against a shared budget scale answers the
 * same question the day-by-day line does — am I ahead of where I was, and
 * against the line — from data that already exists.
 */
export function SpendThisMonth({
  month,
  compareMonth,
  monthLabel,
  onCompareChange,
  compareOptions,
}: {
  month: string;
  compareMonth: string;
  monthLabel: (key: string) => string;
  onCompareChange: (key: string) => void;
  compareOptions: string[];
}) {
  const current = useBudget(month);
  const comparison = useBudget(compareMonth);

  const spent = current.data?.total_spent ?? 0;
  const budgeted = current.data?.total_budgeted ?? 0;
  const comparedSpent = comparison.data?.total_spent ?? 0;
  const comparisonHasData = (comparison.data?.total_spent ?? 0) > 0;

  // Both bars and the budget marker share one scale, or the comparison is
  // decorative — two bars on independent scales say nothing about each other.
  const scale = Math.max(spent, comparedSpent, budgeted, 1);
  const pct = (value: number) => `${Math.min((value / scale) * 100, 100)}%`;

  const delta = spent - comparedSpent;

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
          <p className="mt-1.5 flex items-center gap-1.5 text-[13px] text-muted-foreground">
            <span
              aria-hidden
              className="size-2 rounded-full"
              style={{ backgroundColor: "var(--chart-1)" }}
            />
            {monthLabel(month)}
          </p>
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
                {monthLabel(key)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-5 space-y-3">
        <Bar
          label={monthLabel(month)}
          value={spent}
          width={pct(spent)}
          colour="var(--chart-1)"
        />
        <Bar
          label={monthLabel(compareMonth)}
          value={comparedSpent}
          width={pct(comparedSpent)}
          colour="var(--chart-6)"
          muted
          empty={!comparisonHasData}
        />
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

function Bar({
  label,
  value,
  width,
  colour,
  muted = false,
  empty = false,
}: {
  label: string;
  value: number;
  width: string;
  colour: string;
  muted?: boolean;
  empty?: boolean;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-[13px]">
        <span className={cn(muted ? "text-muted-foreground" : "")}>{label}</span>
        {empty ? (
          <span className="text-[12px] text-muted-foreground">No spending recorded</span>
        ) : (
          <Money minorUnits={value} className={cn("font-medium", muted && "text-muted-foreground")} />
        )}
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full transition-[width] duration-300"
          style={{ width, backgroundColor: colour }}
        />
      </div>
    </div>
  );
}
