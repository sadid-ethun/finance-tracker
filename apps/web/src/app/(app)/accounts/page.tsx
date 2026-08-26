import { AccountsView } from "@/components/accounts/accounts-view";
import { AddAccountButton } from "@/components/accounts/add-account-dialog";
import { PageHeader } from "@/components/layout/page-header";

export default function AccountsPage() {
  return (
    <>
      <PageHeader
        title="Accounts"
        description="What you own, and what you owe."
        action={<AddAccountButton />}
      />
      <AccountsView />
    </>
  );
}
