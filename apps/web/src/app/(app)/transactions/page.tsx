"use client";

import { Plus } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { AddTransactionDialog } from "@/components/transactions/add-transaction-dialog";
import { TransactionList } from "@/components/transactions/transaction-list";

export default function TransactionsPage() {
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
      <PageHeader
        title="Transactions"
        description="Search and filters arrive in Phase 3."
        action={addButton}
      />
      <TransactionList emptyAction={addButton} />
    </>
  );
}
