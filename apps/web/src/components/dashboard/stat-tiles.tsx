"use client";

import { motion } from "motion/react";

import { Money } from "@/components/shared/money";
import { Skeleton } from "@/components/shared/states";
import type { DashboardSummary } from "@/hooks/use-finance";

/** Cards stagger in by 40ms — motion confirms, it does not decorate. */
const stagger = {
  hidden: { opacity: 0, y: 8 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.04, duration: 0.2, ease: [0.32, 0.72, 0, 1] as const },
  }),
};

export function StatTiles({ summary }: { summary: DashboardSummary | undefined }) {
  if (!summary) {
    return (
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-[92px] rounded-card" />
        ))}
      </div>
    );
  }

  const tiles = [
    { label: "Assets", value: summary.assets },
    { label: "Liabilities", value: summary.liabilities },
  ];

  const balances = [
    { label: "Cash", value: summary.cash },
    { label: "Investments", value: summary.investments },
    { label: "Credit", value: summary.credit },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {tiles.map((tile, i) => (
          <motion.div
            key={tile.label}
            custom={i}
            variants={stagger}
            initial="hidden"
            animate="show"
            className="rounded-card border border-border bg-card p-5"
          >
            <p className="text-[13px] text-muted-foreground">{tile.label}</p>
            <Money
              minorUnits={tile.value}
              currency={summary.currency}
              className="mt-1 block text-[22px] font-semibold tracking-[-0.02em]"
            />
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {balances.map((tile, i) => (
          <motion.div
            key={tile.label}
            custom={i + 2}
            variants={stagger}
            initial="hidden"
            animate="show"
            className="rounded-card border border-border bg-card p-4"
          >
            <p className="text-[13px] text-muted-foreground">{tile.label}</p>
            <Money
              minorUnits={tile.value}
              currency={summary.currency}
              className="mt-0.5 block text-[16px] font-semibold"
            />
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/** Income and spending for the month, split by a hairline (PLAN.md 21). */
export function MonthCard({ summary }: { summary: DashboardSummary | undefined }) {
  if (!summary) return <Skeleton className="h-[104px] rounded-card" />;

  const delta = (current: number, previous: number) =>
    previous === 0 ? null : Math.round(((current - previous) / previous) * 100);

  const incomeDelta = delta(summary.monthly_income, summary.previous_month_income);
  const spendDelta = delta(summary.monthly_spending, summary.previous_month_spending);

  return (
    <section className="rounded-card border border-border bg-card p-5">
      <p className="text-[13px] font-medium text-muted-foreground">This month</p>
      <div className="mt-3 grid grid-cols-2 divide-x divide-border">
        <div className="pr-4">
          <p className="text-[13px] text-muted-foreground">Income</p>
          <Money
            minorUnits={summary.monthly_income}
            currency={summary.currency}
            className="mt-0.5 block text-[20px] font-semibold"
          />
          {incomeDelta !== null ? (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {incomeDelta >= 0 ? "+" : ""}
              {incomeDelta}% vs last month
            </p>
          ) : null}
        </div>
        <div className="pl-4">
          <p className="text-[13px] text-muted-foreground">Spending</p>
          <Money
            minorUnits={summary.monthly_spending}
            currency={summary.currency}
            className="mt-0.5 block text-[20px] font-semibold"
          />
          {spendDelta !== null ? (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {spendDelta >= 0 ? "+" : ""}
              {spendDelta}% vs last month
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
