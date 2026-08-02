import { TrendingUp } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";

export default function InvestmentsPage() {
  return (
    <>
      <PageHeader title="Investments" description="Holdings and allocation land in Phase 7." />
      <EmptyState
        icon={TrendingUp}
        title="No investment accounts"
        description="Connect a brokerage to track holdings. Arrives in Phase 7."
      />
    </>
  );
}
