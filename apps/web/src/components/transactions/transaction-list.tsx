"use client";

import { useState } from "react";
import { ArrowLeftRight, Receipt, Scissors } from "lucide-react";

import { Card } from "@/components/shared/card";
import { EmptyState } from "@/components/shared/empty-state";
import { Money } from "@/components/shared/money";
import { ErrorState, RowSkeleton } from "@/components/shared/states";
import { useCategories, useTransactions, type Transaction } from "@/hooks/use-finance";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

import { BulkActionBar } from "./bulk-action-bar";
import { TransactionDetailSheet } from "./transaction-detail-sheet";

export function TransactionList({
  filters = {},
  emptyAction,
  selectable = false,
  emptyTitle = "Nothing here yet",
  emptyDescription = "Add a transaction by hand, or connect an account in Phase 4.",
  pageSize,
}: {
  filters?: Record<string, string>;
  emptyAction?: React.ReactNode;
  selectable?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  /** Rows per page. Lower it where the list sits under other content. */
  pageSize?: number;
}) {
  const query = useTransactions(filters, pageSize);
  const categories = useCategories();
  const [selected, setSelected] = useState<string[]>([]);
  const [active, setActive] = useState<Transaction | null>(null);

  if (query.isLoading) return <RowSkeleton count={Math.min(pageSize ?? 8, 8)} />;
  if (query.isError) return <ErrorState onRetry={() => void query.refetch()} />;

  const rows = query.data?.pages.flatMap((p) => p.data) ?? [];

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Receipt}
        title={emptyTitle}
        description={emptyDescription}
        action={emptyAction}
      />
    );
  }

  const categoryById = new Map((categories.data ?? []).map((c) => [c.id, c] as const));

  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  return (
    <div className="space-y-4">
      <Card as="ul" className="divide-y divide-border overflow-hidden">
        {rows.map((transaction) => {
          const category = transaction.category_id
            ? categoryById.get(transaction.category_id)
            : undefined;
          return (
            <TransactionRow
              key={transaction.id}
              transaction={transaction}
              categoryName={category?.name}
              categoryColor={category?.color ?? undefined}
              selectable={selectable}
              selected={selected.includes(transaction.id)}
              onToggle={() => toggle(transaction.id)}
              onOpen={() => setActive(transaction)}
            />
          );
        })}
      </Card>

      {query.hasNextPage ? (
        <button
          type="button"
          onClick={() => void query.fetchNextPage()}
          disabled={query.isFetchingNextPage}
          className="h-11 w-full rounded-[14px] border border-border text-[14px] font-medium disabled:opacity-60"
        >
          {query.isFetchingNextPage ? "Loading…" : "Load more"}
        </button>
      ) : null}

      {active ? (
        <TransactionDetailSheet
          transaction={active}
          onClose={() => setActive(null)}
        />
      ) : null}

      {selectable ? (
        <BulkActionBar selected={selected} onClear={() => setSelected([])} />
      ) : null}
    </div>
  );
}

function TransactionRow({
  transaction,
  categoryName,
  categoryColor,
  selectable,
  selected,
  onToggle,
  onOpen,
}: {
  transaction: Transaction;
  categoryName?: string;
  categoryColor?: string;
  selectable: boolean;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const label = transaction.merchant_name || transaction.name;

  return (
    <li className={cn("flex items-center gap-3 pr-4", selected && "bg-accent/40")}>
      {selectable ? (
        <label className="flex cursor-pointer items-center py-4 pr-1 pl-4">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            aria-label={`Select ${label}`}
            className="size-4 rounded border-input"
          />
        </label>
      ) : null}

      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-3 py-4 text-left transition-colors hover:bg-secondary/40",
          !selectable && "pl-4",
        )}
      >
        <span
          aria-hidden
          className="flex size-9 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold text-white"
          style={{ backgroundColor: categoryColor ?? "var(--muted-foreground)" }}
        >
          {label.charAt(0).toUpperCase()}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[15px] font-medium">{label}</span>
            {transaction.is_split ? (
              <Scissors className="size-3.5 shrink-0 text-muted-foreground" />
            ) : null}
            {transaction.is_transfer ? (
              <ArrowLeftRight className="size-3.5 shrink-0 text-muted-foreground" />
            ) : null}
          </span>
          <span className="block truncate text-[13px] text-muted-foreground">
            {formatDate(transaction.date)}
            {categoryName ? ` · ${categoryName}` : " · Uncategorized"}
            {transaction.pending ? " · Pending" : ""}
          </span>
        </span>

        <Money
          minorUnits={transaction.amount}
          currency={transaction.currency}
          colored
          className="text-[15px] font-semibold"
        />
      </button>
    </li>
  );
}
