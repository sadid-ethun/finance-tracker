"use client";

import Link from "next/link";
import { Wallet } from "lucide-react";

import { SectionLabel } from "@/components/shared/card";
import { CashFlowChart, SpendingByCategory } from "@/components/dashboard/charts";
import { NetWorthHero } from "@/components/dashboard/net-worth-hero";
import { MonthCard, StatTiles } from "@/components/dashboard/stat-tiles";
import { EmptyState } from "@/components/shared/empty-state";
import { Money } from "@/components/shared/money";
import { ErrorState, RowSkeleton } from "@/components/shared/states";
import {
  useAccounts,
  useDashboardSummary,
  useRecentTransactions,
} from "@/hooks/use-finance";
import { formatDate } from "@/lib/format";

export function DashboardView() {
  const summary = useDashboardSummary();
  const accounts = useAccounts();

  if (summary.isError) {
    return <ErrorState onRetry={() => void summary.refetch()} />;
  }

  // Nothing to summarise until at least one account exists.
  if (accounts.data && accounts.data.length === 0) {
    return (
      <EmptyState
        icon={Wallet}
        title="Connect your first account"
        description="Link a bank or add an account by hand to see your full picture."
        action={
          <Link
            href="/accounts"
            className="inline-flex h-10 items-center rounded-[14px] bg-primary px-4 text-[14px] font-semibold text-primary-foreground"
          >
            Add an account
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-8">
      <NetWorthHero summary={summary.data} />
      <StatTiles summary={summary.data} />
      <MonthCard summary={summary.data} />
      <SpendingByCategory />
      <CashFlowChart />
      <RecentTransactions />
    </div>
  );
}

function RecentTransactions() {
  const query = useRecentTransactions(5);

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <SectionLabel as="h2">Recent</SectionLabel>
        <Link
          href="/transactions"
          className="text-[14px] font-medium text-primary underline-offset-4 hover:underline"
        >
          View all
        </Link>
      </div>

      {query.isLoading ? (
        <RowSkeleton count={5} />
      ) : (query.data ?? []).length === 0 ? (
        <p className="rounded-card border border-border bg-card p-5 text-[14px] text-muted-foreground">
          No transactions yet.
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-card">
          {(query.data ?? []).map((t) => {
            const label = t.merchant_name || t.name;
            return (
              <li key={t.id} className="flex items-center gap-3 p-4">
                <span
                  aria-hidden
                  className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-[13px] font-semibold text-accent-foreground"
                >
                  {label.charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium">{label}</span>
                  <span className="block text-[13px] text-muted-foreground">
                    {formatDate(t.date)}
                  </span>
                </span>
                <Money
                  minorUnits={t.amount}
                  currency={t.currency}
                  colored
                  className="text-[15px] font-semibold"
                />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
