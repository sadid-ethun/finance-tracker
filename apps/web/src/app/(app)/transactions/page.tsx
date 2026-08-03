import { PageHeader } from "@/components/layout/page-header";
import { AddTransactionButton } from "@/components/transactions/transactions-view";
import { TransactionsBoundary } from "@/components/transactions/transactions-boundary";

export default function TransactionsPage() {
  return (
    <>
      <PageHeader
        title="Transactions"
        description="Search, filter, split, and categorize."
        action={<AddTransactionButton />}
      />
      <TransactionsBoundary />
    </>
  );
}
