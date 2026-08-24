"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, PiggyBank } from "lucide-react";

import { SpendThisMonth } from "@/components/budgets/spend-this-month";
import { Card, SectionLabel } from "@/components/shared/card";
import { EmptyState } from "@/components/shared/empty-state";
import { Money } from "@/components/shared/money";
import { ErrorState, RowSkeleton, Skeleton } from "@/components/shared/states";
import {
  useBudget,
  useCopyBudget,
  useSetBudgetCategory,
  type BudgetLine,
} from "@/hooks/use-finance";
import { cn } from "@/lib/utils";

import { BudgetSetup } from "./budget-setup";

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  return monthKey(new Date(y, m - 1 + delta, 1));
}

/** Bar rows and the compare control need something narrower than "September 2026". */
function shortMonthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

export function BudgetView() {
  const [month, setMonth] = useState(() => monthKey(new Date()));
  const budget = useBudget(month);
  const copy = useCopyBudget(month);

  const thisMonth = monthKey(new Date());

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setMonth((m) => shiftMonth(m, -1))}
          aria-label="Previous month"
          className="rounded-[12px] border border-border p-2 hover:bg-secondary"
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="text-[15px] font-semibold">{monthLabel(month)}</span>
        <button
          type="button"
          onClick={() => setMonth((m) => shiftMonth(m, 1))}
          disabled={month >= thisMonth}
          aria-label="Next month"
          className="rounded-[12px] border border-border p-2 hover:bg-secondary disabled:opacity-40"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      {budget.isLoading ? (
        <>
          <Skeleton className="h-[120px] rounded-card" />
          <RowSkeleton count={4} />
        </>
      ) : budget.isError ? (
        <ErrorState onRetry={() => void budget.refetch()} />
      ) : !budget.data?.exists || budget.data.categories.length === 0 ? (
        <BudgetSetup
          month={month}
          onCopyPrevious={() => copy.mutate(shiftMonth(month, -1))}
          copying={copy.isPending}
          copyFailed={copy.isError}
        />
      ) : (
        <BudgetBody month={month} data={budget.data} />
      )}
    </div>
  );
}

function BudgetBody({
  month,
  data,
}: {
  month: string;
  data: NonNullable<ReturnType<typeof useBudget>["data"]>;
}) {
  // Defaults to the month before, which is the comparison anyone reaches for
  // first. Six back is enough to cover a seasonal comparison without turning
  // the control into a scroll.
  const [compareMonth, setCompareMonth] = useState(() => shiftMonth(month, -1));
  const compareOptions = Array.from({ length: 6 }, (_, i) => shiftMonth(month, -(i + 1)));

  const overall = data.total_budgeted
    ? Math.round((data.total_spent / data.total_budgeted) * 100)
    : 0;
  const isOver = data.total_remaining < 0;

  return (
    <>
      <SpendThisMonth
        month={month}
        compareMonth={compareMonth}
        monthLabel={shortMonthLabel}
        onCompareChange={setCompareMonth}
        compareOptions={compareOptions}
      />

      {/* Kept below the comparison: the headline is now "what did I spend",
          and this is the answer to "how much is left", which is a different
          question and a smaller one. */}
      <Card as="section" className="p-5">
        <p className="text-[13px] font-medium text-muted-foreground">
          {isOver ? "Over budget by" : "Left to spend"}
        </p>
        <Money
          minorUnits={Math.abs(data.total_remaining)}
          className="mt-1 block text-[28px] leading-none font-semibold tracking-[-0.02em]"
        />
        <div className="mt-4">
          <ProgressBar percent={overall} over={isOver} />
          <div className="mt-2 flex justify-between text-[13px] text-muted-foreground">
            <span>
              <Money minorUnits={data.total_spent} className="font-medium" /> spent
            </span>
            <span>
              of <Money minorUnits={data.total_budgeted} className="font-medium" />
            </span>
          </div>
        </div>
      </Card>

      <section>
        <SectionLabel as="h2" className="mb-3">Categories</SectionLabel>
        <ul className="space-y-3">
          {data.categories.map((line) => (
            <BudgetRow key={line.category_id} month={month} line={line} />
          ))}
        </ul>
      </section>

      {data.unbudgeted.length > 0 ? (
        <section>
          <SectionLabel as="h2" className="mb-1">
            Not budgeted
          </SectionLabel>
          <p className="mb-3 text-[13px] text-muted-foreground">
            Spending in categories with no limit — the usual reason a month
            doesn&apos;t add up.
          </p>
          <Card as="ul" className="divide-y divide-border overflow-hidden">
            {data.unbudgeted.map((row) => (
              <li key={row.category_id} className="flex items-center gap-3 p-4">
                <span
                  aria-hidden
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: row.color ?? "var(--muted-foreground)" }}
                />
                <span className="flex-1 truncate text-[15px]">{row.name}</span>
                <Money minorUnits={row.spent} className="text-[15px] font-semibold" />
              </li>
            ))}
          </Card>
        </section>
      ) : null}
    </>
  );
}

function BudgetRow({ month, line }: { month: string; line: BudgetLine }) {
  const setAmount = useSetBudgetCategory(month);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState((line.budgeted / 100).toFixed(2));

  async function save() {
    const major = Number.parseFloat(value);
    if (!Number.isNaN(major)) {
      await setAmount.mutateAsync({
        categoryId: line.category_id,
        amount: Math.round(major * 100),
      });
    }
    setEditing(false);
  }

  return (
    <Card as="li" className="p-4">
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className="size-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: line.color ?? "var(--muted-foreground)" }}
        />
        <span className="min-w-0 flex-1 truncate text-[15px] font-medium">
          {line.name}
        </span>

        {editing ? (
          <input
            type="number"
            step="0.01"
            min="0"
            value={value}
            autoFocus
            onChange={(e) => setValue(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => e.key === "Enter" && void save()}
            aria-label={`${line.name} budget`}
            className="tabular h-9 w-28 rounded-[10px] border border-input bg-background px-2 text-right text-[14px] outline-none focus:border-ring"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="tabular text-[14px] font-medium text-muted-foreground hover:text-foreground"
          >
            <Money minorUnits={line.budgeted} /> budget
          </button>
        )}
      </div>

      <div className="mt-3">
        <ProgressBar percent={line.percent} over={line.over} />
        <div className="mt-1.5 flex justify-between text-[13px]">
          <Money minorUnits={line.spent} className="text-muted-foreground" />
          <span
            style={{ color: line.over ? "var(--negative)" : "var(--muted-foreground)" }}
          >
            {line.over ? (
              <>
                <Money minorUnits={Math.abs(line.remaining)} /> over
              </>
            ) : (
              <>
                <Money minorUnits={line.remaining} /> left
              </>
            )}
          </span>
        </div>
      </div>
    </Card>
  );
}

function ProgressBar({ percent, over }: { percent: number; over: boolean }) {
  // Cap the bar at 100% so the track never overflows, but the label still
  // reports the true percentage.
  const width = Math.min(percent, 100);
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-secondary"
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn("h-full rounded-full transition-[width] duration-300")}
        style={{
          width: `${width}%`,
          backgroundColor: over
            ? "var(--negative)"
            : percent >= 85
              ? "var(--chart-4)"
              : "var(--primary)",
        }}
      />
    </div>
  );
}

export { EmptyState, PiggyBank };
