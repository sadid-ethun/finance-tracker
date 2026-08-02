import { AccountDetail } from "@/components/accounts/account-detail";

export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AccountDetail accountId={id} />;
}
