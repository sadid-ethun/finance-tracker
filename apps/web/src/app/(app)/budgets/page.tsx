import { PageHeader } from "@/components/layout/page-header";
import { BudgetView } from "@/components/budgets/budget-view";

export default function BudgetsPage() {
  return (
    <>
      <PageHeader
        title="Budget"
        description="Monthly limits, measured against what you actually spent."
      />
      <BudgetView />
    </>
  );
}
