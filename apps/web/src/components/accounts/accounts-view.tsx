"use client";

import { AccountList } from "@/components/accounts/account-list";
import { NetWorthHero } from "@/components/dashboard/net-worth-hero";
import { StatTiles } from "@/components/dashboard/stat-tiles";
import { ErrorState } from "@/components/shared/states";
import { useAccounts, useDashboardSummary } from "@/hooks/use-finance";

/**
 * Accounts: net worth, what it is made of, and the accounts it is made of.
 *
 * Net worth lives here rather than on Portfolio because it includes credit
 * card debt and checking balances — a portfolio is holdings, and this is the
 * total. Putting it on the page that lists its components means the summary
 * and the detail read in one pass (IA_PLAN.md).
 */
export function AccountsView() {
  const summary = useDashboardSummary();
  const accounts = useAccounts();

  if (summary.isError) {
    return <ErrorState onRetry={() => void summary.refetch()} />;
  }

  // With no accounts there is no net worth to lead with, and a hero reading
  // $0.00 above an empty list is worse than the empty state alone. AccountList
  // already owns that case, including the button that resolves it.
  if (accounts.data && accounts.data.length === 0) {
    return <AccountList />;
  }

  return (
    <div className="space-y-8">
      <NetWorthHero summary={summary.data} />
      <StatTiles summary={summary.data} />
      <AccountList />
    </div>
  );
}
