import { Settings2 } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" description="Connections, categories, and rules land in Phase 8." />
      <EmptyState
        icon={Settings2}
        title="Nothing to configure yet"
        description="Settings become useful once accounts and categories exist."
      />
    </>
  );
}
