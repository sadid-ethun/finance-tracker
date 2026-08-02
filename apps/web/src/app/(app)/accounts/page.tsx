import { AccountList } from "@/components/accounts/account-list";
import { PageHeader } from "@/components/layout/page-header";

export default function AccountsPage() {
  return (
    <>
      <PageHeader title="Accounts" description="Balances across everything you track." />
      <AccountList />
    </>
  );
}
