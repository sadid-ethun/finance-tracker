"use client";

import { AccountList } from "@/components/accounts/account-list";
import { Connections } from "@/components/accounts/connections";
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
 *
 * Connections sits at the bottom for the same reason it left Settings:
 * managing a bank is an account action. It also puts the two ways to add an
 * account — connect a bank, add one by hand — on one screen.
 */
export function AccountsView() {
  const summary = useDashboardSummary();
  const accounts = useAccounts();

  if (summary.isError) {
    return <ErrorState onRetry={() => void summary.refetch()} />;
  }

  // With no accounts there is no net worth to lead with, and a hero reading
  // $0.00 above an empty list is worse than the empty state alone.
  //
  // Connections still renders: AccountList's empty state only offers the
  // manual dialog, so without this the one path that matters most on a fresh
  // install — connect a bank — would be the one path missing.
  if (accounts.data && accounts.data.length === 0) {
    return (
      <div className="space-y-8">
        <AccountList />
        <Connections />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <NetWorthHero summary={summary.data} />
      <StatTiles summary={summary.data} />
      <AccountList />
      <Connections />
    </div>
  );
}
