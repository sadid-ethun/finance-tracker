import { PageHeader } from "@/components/layout/page-header";
import { DashboardView } from "@/components/dashboard/dashboard-view";

export default function DashboardPage() {
  return (
    <>
      <PageHeader title="Home" />
      <DashboardView />
    </>
  );
}
