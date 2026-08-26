"use client";

import { Plus } from "lucide-react";

import { AddTransactionDialog } from "@/components/transactions/add-transaction-dialog";
import { TransactionFilters } from "@/components/transactions/transaction-filters";
import { TransactionList } from "@/components/transactions/transaction-list";
import { useTransactionFilters } from "@/hooks/use-transaction-filters";

/**
 * Reads filters from the URL, so it must sit inside a Suspense boundary owned
 * by a server component. Wrapping it from within a "use client" page leaves the
 * boundary unhydrated on a hard load — it only recovers on soft navigation.
 */
export function TransactionsView() {
  const { params, activeCount, clear } = useTransactionFilters();

  const addButton = (
    <AddTransactionDialog
      trigger={
        <>
          <Plus className="size-4" /> Add
        </>
      }
    />
  );

  return (
    <>
      <TransactionFilters />
      <TransactionList
        filters={params}
        selectable
        // Ten rather than the default 25: the list sits under two charts now,
        // so a full page pushed the end of the screen a long way down for a
        // set of rows most visits do not read. "Load more" is unchanged.
        pageSize={10}
        emptyAction={
          activeCount > 0 ? (
            <button
              type="button"
              onClick={clear}
              className="inline-flex h-10 items-center rounded-[14px] bg-primary px-4 text-[14px] font-semibold text-primary-foreground"
            >
              Clear filters
            </button>
          ) : (
            addButton
          )
        }
        emptyTitle={activeCount > 0 ? "No matches" : "Nothing here yet"}
        emptyDescription={
          activeCount > 0
            ? "Try widening your date range or clearing a filter."
            : "Add a transaction by hand, or connect a bank on Accounts."
        }
      />
    </>
  );
}

export function AddTransactionButton() {
  return (
    <AddTransactionDialog
      trigger={
        <>
          <Plus className="size-4" /> Add
        </>
      }
    />
  );
}
