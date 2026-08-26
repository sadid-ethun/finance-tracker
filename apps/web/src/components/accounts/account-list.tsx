"use client";

import Link from "next/link";
import { Landmark, Plus, Wallet } from "lucide-react";

import { Card, SectionLabel } from "@/components/shared/card";
import { Money } from "@/components/shared/money";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState, RowSkeleton } from "@/components/shared/states";
import { useAccounts, type Account } from "@/hooks/use-finance";
import { ACCOUNT_TYPE_LABELS, isLiability } from "@/lib/format";

import { AddAccountDialog } from "./add-account-dialog";

const GROUP_ORDER = ["depository", "investment", "credit", "loan", "other"];

export function AccountList() {
  const accounts = useAccounts();

  if (accounts.isLoading) return <RowSkeleton />;
  if (accounts.isError) {
    return <ErrorState onRetry={() => void accounts.refetch()} />;
  }

  const rows = accounts.data ?? [];

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Wallet}
        title="No accounts yet"
        description="Connect a bank below, or add an account by hand to start tracking."
        action={<AddAccountDialog trigger="Add account" />}
      />
    );
  }

  const grouped = GROUP_ORDER.map((type) => ({
    type,
    items: rows.filter((a) => a.type === type),
  })).filter((g) => g.items.length > 0);

  // The net-worth card that used to sit here moved up into NetWorthHero, which
  // shows the same figure larger, with a chart and a range switcher behind it.
  // Its assets/liabilities pair is now the top row of StatTiles. Both live in
  // AccountsView; this component is the account list again (IA_PLAN.md).
  return (
    <div className="space-y-8">
      <div className="flex justify-end">
        <AddAccountDialog trigger={<><Plus className="size-4" /> Add account</>} />
      </div>

      {grouped.map((group) => (
        <section key={group.type}>
          <SectionLabel as="h2" className="mb-3">
            {ACCOUNT_TYPE_LABELS[group.type] ?? group.type}
          </SectionLabel>
          <Card as="ul" className="divide-y divide-border overflow-hidden">
            {group.items.map((account) => (
              <AccountRow key={account.id} account={account} />
            ))}
          </Card>
        </section>
      ))}
    </div>
  );
}

function AccountRow({ account }: { account: Account }) {
  return (
    <li>
      <Link
        href={`/accounts/${account.id}`}
        className="flex items-center gap-3 p-4 transition-colors hover:bg-secondary/60"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent">
          <Landmark className="size-4 text-accent-foreground" strokeWidth={2} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-medium">{account.name}</span>
          <span className="block text-[13px] text-muted-foreground">
            {ACCOUNT_TYPE_LABELS[account.type] ?? account.type}
            {account.mask ? ` ···· ${account.mask}` : ""}
          </span>
        </span>
        <span className="text-right">
          <Money
            minorUnits={account.balance_current}
            currency={account.currency}
            className="block text-[15px] font-semibold"
          />
          {isLiability(account.type) ? (
            <span className="text-[11px] text-muted-foreground">owed</span>
          ) : null}
        </span>
      </Link>
    </li>
  );
}
