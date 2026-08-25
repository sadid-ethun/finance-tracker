import { PageHeader } from "@/components/layout/page-header";
import { SettingsView } from "@/components/settings/settings-view";

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        settingsLink={false}
        title="Settings"
        description="Connections, security, categories, and your data."
      />
      <SettingsView />
    </>
  );
}
