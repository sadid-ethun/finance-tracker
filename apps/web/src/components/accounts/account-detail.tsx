"use client";

import Link from "next/link";
import { ChevronLeft, Plus } from "lucide-react";

import { SectionLabel } from "@/components/shared/card";
import { Money } from "@/components/shared/money";
import { ErrorState, RowSkeleton, Skeleton } from "@/components/shared/states";
import { AddTransactionDialog } from "@/components/transactions/add-transaction-dialog";
import { TransactionList } from "@/components/transactions/transaction-list";
import { useAccount } from "@/hooks/use-finance";
import { ACCOUNT_TYPE_LABELS, isLiability } from "@/lib/format";

export function AccountDetail({ accountId }: { accountId: string }) {
  const account = useAccount(accountId);

  if (account.isError) {
    return <ErrorState message="Account not found." />;
  }

  return (
    <>
      <Link
        href="/accounts"
        className="mb-4 inline-flex items-center gap-1 text-[14px] font-medium text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Accounts
      </Link>

      {account.isLoading || !account.data ? (
        <div className="space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-10 w-56" />
        </div>
      ) : (
        <section className="rounded-card border border-border bg-card p-5 md:p-6">
          <p className="text-[13px] text-muted-foreground">
            {ACCOUNT_TYPE_LABELS[account.data.type] ?? account.data.type}
            {account.data.mask ? ` ···· ${account.data.mask}` : ""}
          </p>
          <h1 className="mt-0.5 text-[22px] font-semibold tracking-[-0.02em]">
            {account.data.name}
          </h1>
          <Money
            minorUnits={account.data.balance_current}
            currency={account.data.currency}
            className="mt-3 block text-[36px] leading-none font-semibold tracking-[-0.03em]"
          />
          <p className="mt-1.5 text-[13px] text-muted-foreground">
            {isLiability(account.data.type) ? "Amount owed" : "Current balance"}
          </p>
        </section>
      )}

      <div className="mt-8 mb-3 flex items-center justify-between">
        <SectionLabel as="h2">Transactions</SectionLabel>
        <AddTransactionDialog
          accountId={accountId}
          trigger={
            <>
              <Plus className="size-4" /> Add
            </>
          }
        />
      </div>

      {account.isLoading ? (
        <RowSkeleton count={5} />
      ) : (
        <TransactionList filters={{ account_ids: accountId }} />
      )}
    </>
  );
}
