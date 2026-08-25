"use client";

import { SpendThisMonth } from "@/components/budgets/spend-this-month";
import { SpendingByCategory } from "@/components/dashboard/charts";

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * The two charts above the transaction list.
 *
 * They sit here rather than on separate screens because they raise the
 * questions the list answers: the breakdown says a category is larger than
 * expected, and the rows explaining it are directly below rather than a tab
 * away (IA_PLAN.md).
 *
 * Client-side because the month is the reader's month. Computing it in the
 * server component would use the server's timezone, which is UTC in
 * production and would flip the label a few hours early each month-end.
 */
export function SpendingCharts() {
  return (
    <div className="mb-8 space-y-6">
      <SpendThisMonth month={currentMonth()} />
      <SpendingByCategory />
    </div>
  );
}
