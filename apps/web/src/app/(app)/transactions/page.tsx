import { PageHeader } from "@/components/layout/page-header";
import { AddTransactionButton } from "@/components/transactions/transactions-view";
import { SpendingCharts } from "@/components/transactions/spending-charts";
import { TransactionsBoundary } from "@/components/transactions/transactions-boundary";

export default function TransactionsPage() {
  return (
    <>
      <PageHeader
        title="Spending"
        description="Where your money went this month."
        action={<AddTransactionButton />}
      />
      <SpendingCharts />
      <TransactionsBoundary />
    </>
  );
}
