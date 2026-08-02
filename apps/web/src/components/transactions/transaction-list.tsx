"use client";

import { Receipt } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { Money } from "@/components/shared/money";
import { ErrorState, RowSkeleton } from "@/components/shared/states";
import { useCategories, useTransactions, type Transaction } from "@/hooks/use-finance";
import { formatDate } from "@/lib/format";

export function TransactionList({
  filters = {},
  emptyAction,
}: {
  filters?: Record<string, string>;
  emptyAction?: React.ReactNode;
}) {
  const query = useTransactions(filters);
  const categories = useCategories();

  if (query.isLoading) return <RowSkeleton count={8} />;
  if (query.isError) return <ErrorState onRetry={() => void query.refetch()} />;

  const rows = query.data?.pages.flatMap((p) => p.data) ?? [];

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Receipt}
        title="Nothing here yet"
        description="Add a transaction by hand, or connect an account in Phase 4."
        action={emptyAction}
      />
    );
  }

  const categoryById = new Map(
    (categories.data ?? []).map((c) => [c.id, c] as const),
  );

  return (
    <div className="space-y-4">
      <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-card">
        {rows.map((transaction) => (
          <TransactionRow
            key={transaction.id}
            transaction={transaction}
            categoryName={
              transaction.category_id
                ? categoryById.get(transaction.category_id)?.name
                : undefined
            }
            categoryColor={
              transaction.category_id
                ? categoryById.get(transaction.category_id)?.color ?? undefined
                : undefined
            }
          />
        ))}
      </ul>

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
    </div>
  );
}

function TransactionRow({
  transaction,
  categoryName,
  categoryColor,
}: {
  transaction: Transaction;
  categoryName?: string;
  categoryColor?: string;
}) {
  const label = transaction.merchant_name || transaction.name;

  return (
    <li className="flex items-center gap-3 p-4">
      <span
        aria-hidden
        className="flex size-9 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold text-white"
        style={{ backgroundColor: categoryColor ?? "var(--muted-foreground)" }}
      >
        {label.charAt(0).toUpperCase()}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium">{label}</span>
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
    </li>
  );
}
