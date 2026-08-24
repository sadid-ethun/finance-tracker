"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { ChevronLeft, ChevronRight, PiggyBank } from "lucide-react";

import { SpendThisMonth } from "@/components/budgets/spend-this-month";
import { Card, SectionLabel } from "@/components/shared/card";
import { EmptyState } from "@/components/shared/empty-state";
import { Money } from "@/components/shared/money";
import { ErrorState, RowSkeleton, Skeleton } from "@/components/shared/states";
import {
  useBudget,
  useCategories,
  useCopyBudget,
  useDeleteBudget,
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

/**
 * Month name alone, for the chart. The year is noise on a series label — both
 * lines are days of a month, and the day is already the tooltip's heading.
 */
function shortMonthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short" });
}

/**
 * With the year, for the compare picker. Six months back from January reaches
 * the previous year, and two entries reading "Aug" would be indistinguishable.
 */
function pickerMonthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short", year: "numeric" });
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
        <>
          <BudgetBody month={month} data={budget.data} />
          <DeleteBudget month={month} label={monthLabel(month)} />
        </>
      )}
    </div>
  );
}

/**
 * Delete the month's budget.
 *
 * Two-step rather than a modal: the destructive action is not reachable in one
 * tap, and the confirm sits where the trigger was, so nothing moves under the
 * finger between the two.
 *
 * Says what survives. "Delete" next to a screen full of spending figures
 * invites the reading that the spending goes too, and it does not — this
 * removes limits, not transactions.
 */
function DeleteBudget({ month, label }: { month: string; label: string }) {
  const [confirming, setConfirming] = useState(false);
  const remove = useDeleteBudget(month);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="mx-auto block text-[13px] text-muted-foreground underline-offset-4 hover:underline"
      >
        Delete this budget
      </button>
    );
  }

  return (
    <Card as="section" className="p-4">
      <p className="text-[14px]">
        Delete the budget for {label}? Your transactions and spending history
        are not affected — only the limits.
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="h-10 flex-1 rounded-[14px] border border-border text-[14px] font-medium"
        >
          Keep it
        </button>
        <button
          type="button"
          onClick={() => remove.mutate()}
          disabled={remove.isPending}
          className="h-10 flex-1 rounded-[14px] text-[14px] font-semibold disabled:opacity-60"
          style={{ backgroundColor: "var(--negative)", color: "var(--background)" }}
        >
          {remove.isPending ? "Deleting…" : "Delete"}
        </button>
      </div>
      {remove.isError ? (
        <p role="alert" className="mt-2 text-[13px] text-negative">
          Could not delete the budget. Try again.
        </p>
      ) : null}
    </Card>
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
        pickerLabel={pickerMonthLabel}
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
        <AddCategory
          month={month}
          budgetedIds={new Set(data.categories.map((line) => line.category_id))}
          unbudgeted={data.unbudgeted}
        />
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

/**
 * Add a category to an existing budget.
 *
 * Without this, removing a line was one-way: the only route back was deleting
 * the whole budget and rebuilding it.
 *
 * Offers expense categories only. A budget is a spending limit, and income has
 * nothing to limit while transfers are excluded from spending totals entirely
 * — budgeting either would create a line that can never be met or exceeded.
 *
 * Where the category already has spending this month, its amount pre-fills
 * from that: the number you are reaching for is almost always "at least what
 * I have already spent".
 */
function AddCategory({
  month,
  budgetedIds,
  unbudgeted,
}: {
  month: string;
  budgetedIds: Set<string>;
  unbudgeted: { category_id: string; name: string; spent: number }[];
}) {
  const categories = useCategories();
  const setAmount = useSetBudgetCategory(month);
  const [open, setOpen] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const [value, setValue] = useState("");

  const spentBy = new Map(unbudgeted.map((u) => [u.category_id, u.spent]));
  const available = (categories.data ?? []).filter(
    (category) => category.kind === "expense" && !budgetedIds.has(category.id),
  );

  function pick(id: string) {
    setCategoryId(id);
    const spent = spentBy.get(id);
    setValue(spent && spent > 0 ? (spent / 100).toFixed(2) : "");
  }

  async function save() {
    const major = Number.parseFloat(value);
    if (!categoryId || Number.isNaN(major) || major <= 0) return;
    await setAmount.mutateAsync({ categoryId, amount: Math.round(major * 100) });
    setOpen(false);
    setCategoryId("");
    setValue("");
  }

  if (available.length === 0) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-card border border-dashed border-border py-3 text-[14px] font-medium text-muted-foreground transition-colors active:bg-secondary md:hover:text-foreground"
      >
        <Plus className="size-4" strokeWidth={2} />
        Add a category
      </button>
    );
  }

  return (
    <Card as="section" className="mt-3 p-4">
      <label className="block">
        <span className="mb-1.5 block text-[13px] font-medium">Category</span>
        <select
          value={categoryId}
          onChange={(event) => pick(event.target.value)}
          autoFocus
          className="h-10 w-full rounded-[10px] border border-input bg-background px-2 text-[14px] outline-none focus:border-ring"
        >
          <option value="">Choose a category…</option>
          {available.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>

      <label className="mt-3 block">
        <span className="mb-1.5 block text-[13px] font-medium">Monthly limit</span>
        <input
          type="number"
          step="0.01"
          min="0"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="0.00"
          className="tabular h-10 w-full rounded-[10px] border border-input bg-background px-2 text-right text-[14px] outline-none focus:border-ring"
        />
        {spentBy.get(categoryId) ? (
          <span className="mt-1 block text-[12px] text-muted-foreground">
            Already spent <Money minorUnits={spentBy.get(categoryId) ?? 0} /> this month
          </span>
        ) : null}
      </label>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="h-10 flex-1 rounded-[14px] border border-border text-[14px] font-medium"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={!categoryId || setAmount.isPending}
          className="h-10 flex-1 rounded-[14px] bg-primary text-[14px] font-semibold text-primary-foreground disabled:opacity-50"
        >
          {setAmount.isPending ? "Adding…" : "Add"}
        </button>
      </div>
    </Card>
  );
}

function BudgetRow({ month, line }: { month: string; line: BudgetLine }) {
  const setAmount = useSetBudgetCategory(month);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState((line.budgeted / 100).toFixed(2));

  /**
   * Removing a line is setting it to zero — the API reads that as "stop
   * budgeting this" and drops the row, rather than storing a limit of
   * nothing. Spending in the category then reports as unbudgeted instead of
   * as permanently overspent.
   */
  async function remove() {
    await setAmount.mutateAsync({ categoryId: line.category_id, amount: 0 });
  }

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
          <>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="tabular text-[14px] font-medium text-muted-foreground hover:text-foreground"
            >
              <Money minorUnits={line.budgeted} /> budget
            </button>
            <button
              type="button"
              onClick={() => void remove()}
              disabled={setAmount.isPending}
              aria-label={`Stop budgeting ${line.name}`}
              className="shrink-0 rounded-[8px] p-1 text-muted-foreground transition-colors active:bg-secondary disabled:opacity-50 md:hover:text-foreground"
            >
              <X className="size-4" strokeWidth={2} />
            </button>
          </>
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
