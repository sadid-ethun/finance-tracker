"use client";

import { useState } from "react";
import { X } from "lucide-react";

import { useBulkCategorize, useCategories, useLinkTransfer } from "@/hooks/use-finance";

/**
 * Bulk actions for a selection.
 *
 * "Remember this" turns a one-off cleanup into a standing rule — the highest
 * value affordance in the app (PLAN.md section 7). Linking a transfer is
 * offered only for exactly two rows, which is all a transfer can ever be.
 */
export function BulkActionBar({
  selected,
  onClear,
}: {
  selected: string[];
  onClear: () => void;
}) {
  const categories = useCategories();
  const bulk = useBulkCategorize();
  const link = useLinkTransfer();
  const [createRule, setCreateRule] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (selected.length === 0) return null;

  async function handleCategorize(categoryId: string) {
    if (!categoryId) return;
    setError(null);
    try {
      await bulk.mutateAsync({
        transaction_ids: selected,
        category_id: categoryId,
        create_rule: createRule,
      });
      onClear();
    } catch {
      setError("Couldn't update those transactions.");
    }
  }

  async function handleLink() {
    setError(null);
    try {
      await link.mutateAsync(selected);
      onClear();
    } catch {
      setError("Those two can't be linked as a transfer.");
    }
  }

  return (
    <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+64px)] z-40 mx-3 rounded-card border border-border bg-card p-4 lg:bottom-6 lg:mx-auto lg:max-w-2xl">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[15px] font-semibold">
          {selected.length} selected
        </span>
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear selection"
          className="rounded-full p-1.5 text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <select
          defaultValue=""
          onChange={(e) => void handleCategorize(e.target.value)}
          disabled={bulk.isPending}
          aria-label="Set category for selected"
          className="h-11 flex-1 rounded-[14px] border border-input bg-background px-3 text-[15px] outline-none focus:border-ring disabled:opacity-60"
        >
          <option value="">Set category…</option>
          {(categories.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        {selected.length === 2 ? (
          <button
            type="button"
            onClick={handleLink}
            disabled={link.isPending}
            className="h-11 rounded-[14px] border border-border px-4 text-[15px] font-medium disabled:opacity-60"
          >
            {link.isPending ? "Linking…" : "Link as transfer"}
          </button>
        ) : null}
      </div>

      <label className="mt-3 flex items-center gap-2 text-[13px] text-muted-foreground">
        <input
          type="checkbox"
          checked={createRule}
          onChange={(e) => setCreateRule(e.target.checked)}
          className="size-4 rounded border-input"
        />
        Remember this for similar transactions
      </label>

      {error ? (
        <p role="alert" className="mt-2 text-[13px] text-negative">
          {error}
        </p>
      ) : null}
    </div>
  );
}
