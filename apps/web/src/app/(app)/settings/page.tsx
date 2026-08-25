import { PageHeader } from "@/components/layout/page-header";
import { SettingsView } from "@/components/settings/settings-view";

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        settingsLink={false}
        title="Settings"
        description="Security, categories, rules, and your data."
      />
      <SettingsView />
    </>
  );
}
