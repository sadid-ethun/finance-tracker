import { PageHeader } from "@/components/layout/page-header";
import { CashFlowView } from "@/components/cash-flow/cash-flow-view";

export default function CashFlowPage() {
  return (
    <>
      <PageHeader
        title="Cash Flow"
        description="Income, spending, and where the money goes."
      />
      <CashFlowView />
    </>
  );
}
