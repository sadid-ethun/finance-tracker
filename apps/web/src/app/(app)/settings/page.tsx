import { PageHeader } from "@/components/layout/page-header";
import { Connections } from "@/components/settings/connections";

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Bank connections and sync history. Categories and rules land in Phase 8."
      />
      <Connections />
    </>
  );
}
