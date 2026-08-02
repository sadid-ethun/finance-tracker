import { ChartPie } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";

export default function CashFlowPage() {
  return (
    <>
      <PageHeader title="Cash Flow" description="Income, expenses, and trends land in Phase 7." />
      <EmptyState
        icon={ChartPie}
        title="No cash flow yet"
        description="Once transactions exist, your monthly flow appears here."
      />
    </>
  );
}
