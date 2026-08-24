"use client";

import { useState } from "react";
import { PiggyBank } from "lucide-react";

import { Card } from "@/components/shared/card";
import { EmptyState } from "@/components/shared/empty-state";
import { Money } from "@/components/shared/money";
import { Skeleton } from "@/components/shared/states";
import { useBudgetSuggestions, useUpsertBudget } from "@/hooks/use-finance";

/**
 * First-run budget builder.
 *
 * Starts from average spend over the last three months rather than a blank
 * form — the difference between a feature people use and one they abandon.
 */
export function BudgetSetup({
  month,
  onCopyPrevious,
  copying,
  copyFailed,
}: {
  month: string;
  onCopyPrevious: () => void;
  copying: boolean;
  copyFailed: boolean;
}) {
  const [building, setBuilding] = useState(false);
  const suggestions = useBudgetSuggestions(month, building);
  const upsert = useUpsertBudget(month);
  // Only user edits are held in state; anything untouched falls back to the
  // suggestion. Syncing fetched data into state via an effect would mean two
  // sources of truth and a render where they disagree.
  const [edits, setEdits] = useState<Record<string, string>>({});

  const valueFor = (categoryId: string, suggested: number): string =>
    edits[categoryId] ?? (suggested / 100).toFixed(2);

  if (!building) {
    return (
      <EmptyState
        icon={PiggyBank}
        title="Set your first budget"
        description="Pick a few categories to start. We can suggest limits from what you've actually been spending."
        action={
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => setBuilding(true)}
              className="inline-flex h-10 items-center justify-center rounded-[14px] bg-primary px-4 text-[14px] font-semibold text-primary-foreground"
            >
              Build a budget
            </button>
            <button
              type="button"
              onClick={onCopyPrevious}
              disabled={copying}
              className="inline-flex h-10 items-center justify-center rounded-[14px] border border-border px-4 text-[14px] font-medium disabled:opacity-60"
            >
              {copying ? "Copying…" : "Copy last month"}
            </button>
          </div>
        }
      />
    );
  }

  const rows = suggestions.data ?? [];

  async function save() {
    const categories = rows
      .map((row) => ({
        category_id: row.category_id,
        amount: Math.round(
          Number.parseFloat(valueFor(row.category_id, row.suggested)) * 100,
        ),
      }))
      .filter((c) => Number.isFinite(c.amount) && c.amount > 0);

    if (categories.length === 0) return;
    await upsert.mutateAsync({ categories });
  }

  const total = rows.reduce((sum, row) => {
    const v = Number.parseFloat(valueFor(row.category_id, row.suggested));
    return sum + (Number.isNaN(v) ? 0 : Math.round(v * 100));
  }, 0);

  return (
    <div className="space-y-4">
      {copyFailed ? (
        <p role="alert" className="text-[13px] text-negative">
          No budget found for last month to copy.
        </p>
      ) : null}

      <Card as="section" className="p-5">
        <h2 className="text-[18px] font-semibold">Suggested limits</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Based on your average spend over the last 3 months. Adjust anything,
          set a category to 0 to skip it.
        </p>

        {suggestions.isLoading ? (
          <div className="mt-4 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-11 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="mt-4 text-[14px] text-muted-foreground">
            Not enough spending history yet. Add some transactions first, or copy
            last month&apos;s budget.
          </p>
        ) : (
          <>
            <ul className="mt-4 space-y-2">
              {rows.map((row) => (
                <li key={row.category_id} className="flex items-center gap-2.5">
                  <span
                    aria-hidden
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: row.color ?? "var(--muted-foreground)" }}
                  />
                  <span className="min-w-0 flex-1 truncate text-[15px]">{row.name}</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={valueFor(row.category_id, row.suggested)}
                    onChange={(e) =>
                      setEdits((prev) => ({
                        ...prev,
                        [row.category_id]: e.target.value,
                      }))
                    }
                    aria-label={`${row.name} limit`}
                    className="tabular h-10 w-28 rounded-[10px] border border-input bg-background px-2 text-right text-[14px] outline-none focus:border-ring"
                  />
                </li>
              ))}
            </ul>

            <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
              <span className="text-[14px] text-muted-foreground">Total</span>
              <Money minorUnits={total} className="text-[17px] font-semibold" />
            </div>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setBuilding(false)}
                className="h-11 flex-1 rounded-[14px] border border-border text-[15px] font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={save}
                disabled={upsert.isPending || total === 0}
                className="h-11 flex-1 rounded-[14px] bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-50"
              >
                {upsert.isPending ? "Saving…" : "Save budget"}
              </button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
