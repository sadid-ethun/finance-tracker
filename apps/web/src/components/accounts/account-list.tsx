"use client";

import Link from "next/link";
import { Landmark, Plus, Wallet } from "lucide-react";

import { Money } from "@/components/shared/money";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState, RowSkeleton } from "@/components/shared/states";
import { useAccounts, useBalanceSummary, type Account } from "@/hooks/use-finance";
import { ACCOUNT_TYPE_LABELS, isLiability } from "@/lib/format";

import { AddAccountDialog } from "./add-account-dialog";

const GROUP_ORDER = ["depository", "investment", "credit", "loan", "other"];

export function AccountList() {
  const accounts = useAccounts();
  const summary = useBalanceSummary();

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
        description="Add an account by hand to start tracking. Bank connections arrive in Phase 4."
        action={<AddAccountDialog trigger="Add account" />}
      />
    );
  }

  const grouped = GROUP_ORDER.map((type) => ({
    type,
    items: rows.filter((a) => a.type === type),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="space-y-8">
      {summary.data ? (
        <section className="rounded-card border border-border bg-card p-5 md:p-6">
          <p className="text-[13px] font-medium text-muted-foreground">Net worth</p>
          <Money
            minorUnits={summary.data.net_worth}
            currency={summary.data.currency}
            className="mt-1 block text-[40px] leading-none font-semibold tracking-[-0.03em]"
          />
          <div className="mt-5 grid grid-cols-2 gap-4 border-t border-border pt-4">
            <div>
              <p className="text-[13px] text-muted-foreground">Assets</p>
              <Money
                minorUnits={summary.data.assets}
                className="mt-0.5 block text-[18px] font-semibold"
              />
            </div>
            <div>
              <p className="text-[13px] text-muted-foreground">Liabilities</p>
              <Money
                minorUnits={summary.data.liabilities}
                className="mt-0.5 block text-[18px] font-semibold"
              />
            </div>
          </div>
        </section>
      ) : null}

      <div className="flex justify-end">
        <AddAccountDialog trigger={<><Plus className="size-4" /> Add account</>} />
      </div>

      {grouped.map((group) => (
        <section key={group.type}>
          <h2 className="mb-3 text-[18px] font-semibold tracking-[-0.01em]">
            {ACCOUNT_TYPE_LABELS[group.type] ?? group.type}
          </h2>
          <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-card">
            {group.items.map((account) => (
              <AccountRow key={account.id} account={account} />
            ))}
          </ul>
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
