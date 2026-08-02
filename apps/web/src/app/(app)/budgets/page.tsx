import { PiggyBank } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";

export default function BudgetsPage() {
  return (
    <>
      <PageHeader title="Budget" description="Monthly and category budgets land in Phase 6." />
      <EmptyState
        icon={PiggyBank}
        title="Set your first budget"
        description="Pick a few categories to start. Budgets arrive in Phase 6."
      />
    </>
  );
}
