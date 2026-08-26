"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import {
  useAssignableCategories,
  useSplitTransaction,
  type Transaction,
} from "@/hooks/use-finance";
import { formatMoney } from "@/lib/format";

type Part = { amount: string; category_id: string };

/**
 * Split editor.
 *
 * The remainder is shown live and the save button stays disabled until the
 * parts balance exactly. The server enforces the same rule — this just means
 * the user never has to discover it via an error.
 */
export function SplitDialog({
  transaction,
  onClose,
}: {
  transaction: Transaction;
  onClose: () => void;
}) {
  const categories = useAssignableCategories();
  const split = useSplitTransaction();

  const totalMinor = transaction.amount;
  const sign = totalMinor < 0 ? -1 : 1;

  const [parts, setParts] = useState<Part[]>([
    { amount: (Math.abs(totalMinor) / 100).toFixed(2), category_id: "" },
    { amount: "", category_id: "" },
  ]);

  const allocated = parts.reduce((sum, p) => {
    const value = Number.parseFloat(p.amount);
    return sum + (Number.isNaN(value) ? 0 : Math.round(value * 100));
  }, 0);
  const remainder = Math.abs(totalMinor) - allocated;
  const balanced = remainder === 0 && parts.every((p) => p.amount !== "");

  function update(index: number, patch: Partial<Part>) {
    setParts((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }

  async function handleSave() {
    if (!balanced) return;
    await split.mutateAsync({
      id: transaction.id,
      // Parts are entered as positive magnitudes; the parent's sign is applied
      // here so a split can never flip an expense into income.
      parts: parts.map((p) => ({
        amount: sign * Math.round(Number.parseFloat(p.amount) * 100),
        category_id: p.category_id || null,
      })),
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/30 sm:items-center sm:p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-card border border-border bg-card p-5 sm:rounded-card">
        <h2 className="text-[18px] font-semibold">Split transaction</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {transaction.name} · {formatMoney(totalMinor, transaction.currency)}
        </p>

        <div className="mt-4 space-y-3">
          {parts.map((part, index) => (
            <div key={index} className="flex items-start gap-2">
              <div className="flex-1 space-y-2">
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={part.amount}
                  onChange={(e) => update(index, { amount: e.target.value })}
                  placeholder="0.00"
                  aria-label={`Part ${index + 1} amount`}
                  className="tabular h-10 w-full rounded-[12px] border border-input bg-background px-3 text-[15px] outline-none focus:border-ring"
                />
                <select
                  value={part.category_id}
                  onChange={(e) => update(index, { category_id: e.target.value })}
                  aria-label={`Part ${index + 1} category`}
                  className="h-10 w-full rounded-[12px] border border-input bg-background px-2.5 text-[14px] outline-none focus:border-ring"
                >
                  <option value="">Uncategorized</option>
                  {(categories.data ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              {parts.length > 2 ? (
                <button
                  type="button"
                  onClick={() => setParts((p) => p.filter((_, i) => i !== index))}
                  aria-label={`Remove part ${index + 1}`}
                  className="mt-1 rounded-[10px] p-2 text-muted-foreground hover:text-negative"
                >
                  <Trash2 className="size-4" />
                </button>
              ) : null}
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setParts((p) => [...p, { amount: "", category_id: "" }])}
          className="mt-3 inline-flex items-center gap-1.5 text-[14px] font-medium text-primary"
        >
          <Plus className="size-4" /> Add part
        </button>

        <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-[14px]">
          <span className="text-muted-foreground">Remaining</span>
          <span
            className="tabular font-semibold"
            style={{ color: remainder === 0 ? "var(--positive)" : "var(--negative)" }}
          >
            {formatMoney(remainder, transaction.currency)}
          </span>
        </div>

        {split.isError ? (
          <p role="alert" className="mt-2 text-[13px] text-negative">
            Couldn&apos;t save that split.
          </p>
        ) : null}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-11 flex-1 rounded-[14px] border border-border text-[15px] font-medium"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!balanced || split.isPending}
            className="h-11 flex-1 rounded-[14px] bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-50"
          >
            {split.isPending ? "Saving…" : "Split"}
          </button>
        </div>
      </div>
    </div>
  );
}
