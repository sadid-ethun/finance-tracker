import { Wallet } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        title="Home"
        description="Your dashboard lands in Phase 5."
      />
      <EmptyState
        icon={Wallet}
        title="Connect your first account"
        description="Link a bank to see your full picture. Account connections arrive in Phase 4."
      />
    </>
  );
}
