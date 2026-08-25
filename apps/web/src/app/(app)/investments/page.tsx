import { PageHeader } from "@/components/layout/page-header";
import { InvestmentsView } from "@/components/investments/investments-view";

export default function InvestmentsPage() {
  return (
    <>
      <PageHeader
        title="Portfolio"
        description="Holdings, allocation, and performance."
      />
      <InvestmentsView />
    </>
  );
}
