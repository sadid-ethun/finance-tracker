"use client";

import { useState } from "react";
import { Link2Off, Scissors, Trash2 } from "lucide-react";

import { Money } from "@/components/shared/money";
import {
  useCategories,
  useDeleteTransaction,
  useUnlinkTransfer,
  useUnsplitTransaction,
  useUpdateTransaction,
  type Transaction,
} from "@/hooks/use-finance";
import { formatDateLong } from "@/lib/format";

import { SplitDialog } from "./split-dialog";

/**
 * Detail sheet: category, notes, and the split/transfer actions.
 *
 * Category and the budget toggle write optimistically, so they feel instant
 * and roll back if the request fails. Notes save on blur rather than per
 * keystroke.
 */
export function TransactionDetailSheet({
  transaction,
  onClose,
}: {
  transaction: Transaction;
  onClose: () => void;
}) {
  const categories = useCategories();
  const update = useUpdateTransaction();
  const remove = useDeleteTransaction();
  const unsplit = useUnsplitTransaction();
  const unlink = useUnlinkTransfer();

  const [notes, setNotes] = useState(transaction.notes ?? "");
  const [splitting, setSplitting] = useState(false);

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/30"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-label="Transaction details"
        className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-card border border-border bg-card p-5 sm:inset-y-0 sm:right-0 sm:left-auto sm:w-[420px] sm:rounded-none sm:border-l"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="truncate text-[18px] font-semibold">
              {transaction.merchant_name || transaction.name}
            </h2>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              {formatDateLong(transaction.date)}
              {transaction.is_transfer ? " · Transfer" : ""}
            </p>
          </div>
          <Money
            minorUnits={transaction.amount}
            currency={transaction.currency}
            colored
            className="text-[20px] font-semibold"
          />
        </div>

        <div className="mt-5 space-y-4">
          <div>
            <label
              htmlFor="detail-category"
              className="mb-1.5 block text-[13px] font-medium"
            >
              Category
            </label>
            <select
              id="detail-category"
              value={transaction.category_id ?? ""}
              onChange={(e) =>
                update.mutate({
                  id: transaction.id,
                  category_id: e.target.value || null,
                })
              }
              className="h-11 w-full rounded-[14px] border border-input bg-background px-3 text-[15px] outline-none focus:border-ring"
            >
              <option value="">Uncategorized</option>
              {(categories.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="detail-notes" className="mb-1.5 block text-[13px] font-medium">
              Notes
            </label>
            <textarea
              id="detail-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => {
                if (notes !== (transaction.notes ?? "")) {
                  update.mutate({ id: transaction.id, notes: notes || null });
                }
              }}
              rows={3}
              placeholder="Add a note"
              className="w-full resize-none rounded-[14px] border border-input bg-background p-3 text-[15px] outline-none focus:border-ring"
            />
          </div>

          {update.isError ? (
            <p role="alert" className="text-[13px] text-negative">
              That change didn&apos;t save.
            </p>
          ) : null}

          <div className="space-y-2 border-t border-border pt-4">
            {transaction.is_split ? (
              <ActionButton
                icon={Scissors}
                label="Remove split"
                onClick={async () => {
                  await unsplit.mutateAsync(transaction.id);
                  onClose();
                }}
              />
            ) : (
              <ActionButton
                icon={Scissors}
                label="Split transaction"
                onClick={() => setSplitting(true)}
              />
            )}

            {transaction.is_transfer ? (
              <ActionButton
                icon={Link2Off}
                label="Unlink transfer"
                onClick={async () => {
                  await unlink.mutateAsync(transaction.id);
                  onClose();
                }}
              />
            ) : null}

            <ActionButton
              icon={Trash2}
              label="Delete transaction"
              destructive
              onClick={async () => {
                await remove.mutateAsync(transaction.id);
                onClose();
              }}
            />
          </div>
        </div>
      </div>

      {splitting ? (
        <SplitDialog
          transaction={transaction}
          onClose={() => {
            setSplitting(false);
            onClose();
          }}
        />
      ) : null}
    </>
  );
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
  destructive = false,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-[14px] px-3 py-2.5 text-left text-[15px] font-medium transition-colors hover:bg-secondary"
      style={destructive ? { color: "var(--negative)" } : undefined}
    >
      <Icon className="size-[18px]" strokeWidth={2} />
      {label}
    </button>
  );
}
