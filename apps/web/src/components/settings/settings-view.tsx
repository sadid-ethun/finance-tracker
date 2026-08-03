"use client";

import { useState } from "react";

import { Connections } from "@/components/settings/connections";
import { Appearance } from "@/components/settings/appearance";
import { DataTools } from "@/components/settings/data-tools";
import { TwoFactorSetup } from "@/components/settings/two-factor";
import { Money } from "@/components/shared/money";
import { RowSkeleton } from "@/components/shared/states";
import { useAuditLog, useCategories, useRules, useDeleteRule } from "@/hooks/use-finance";
import { cn } from "@/lib/utils";

const TABS = ["Connections", "Security", "Categories", "Rules", "Data"] as const;
type Tab = (typeof TABS)[number];

export function SettingsView() {
  const [tab, setTab] = useState<Tab>("Connections");

  return (
    <div className="space-y-6">
      <div className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">
        <div className="flex w-max gap-1 rounded-[14px] bg-secondary p-1 lg:w-full">
          {TABS.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => setTab(name)}
              aria-pressed={tab === name}
              className={cn(
                "h-9 rounded-[11px] px-3.5 text-[13px] font-medium whitespace-nowrap lg:flex-1",
                tab === name ? "bg-card shadow-sm" : "text-muted-foreground",
              )}
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      {tab === "Connections" ? <Connections /> : null}
      {tab === "Security" ? (
        <div className="space-y-6">
          <TwoFactorSetup />
          <Appearance />
          <AuditLog />
        </div>
      ) : null}
      {tab === "Categories" ? <CategoryList /> : null}
      {tab === "Rules" ? <RuleList /> : null}
      {tab === "Data" ? <DataTools /> : null}
    </div>
  );
}

function CategoryList() {
  const categories = useCategories();

  if (categories.isLoading) return <RowSkeleton count={6} />;

  const byKind = {
    income: (categories.data ?? []).filter((c) => c.kind === "income"),
    expense: (categories.data ?? []).filter((c) => c.kind === "expense"),
    transfer: (categories.data ?? []).filter((c) => c.kind === "transfer"),
  };

  return (
    <div className="space-y-6">
      {(["expense", "income", "transfer"] as const).map((kind) => (
        <section key={kind}>
          <h2 className="mb-1 text-[18px] font-semibold capitalize">{kind}</h2>
          {kind === "transfer" ? (
            <p className="mb-3 text-[13px] text-muted-foreground">
              Excluded from income and spending totals — moving money between your
              own accounts is neither.
            </p>
          ) : null}
          <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-card">
            {byKind[kind].map((c) => (
              <li key={c.id} className="flex items-center gap-3 p-3.5">
                <span
                  aria-hidden
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: c.color ?? "var(--muted-foreground)" }}
                />
                <span className="flex-1 truncate text-[15px]">{c.name}</span>
                <span className="text-[12px] text-muted-foreground">{c.slug}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function RuleList() {
  const rules = useRules();
  const remove = useDeleteRule();

  if (rules.isLoading) return <RowSkeleton count={3} />;

  if ((rules.data ?? []).length === 0) {
    return (
      <p className="rounded-card border border-border bg-card p-5 text-[14px] text-muted-foreground">
        No rules yet. Select transactions on the Transactions page and tick
        &ldquo;Remember this&rdquo; to create one.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-card">
      {(rules.data ?? []).map((rule) => (
        <li key={rule.id} className="flex items-center gap-3 p-4">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-medium">{rule.name}</span>
            <span className="block text-[12px] text-muted-foreground">
              priority {rule.priority} · {rule.is_active ? "active" : "paused"}
            </span>
          </span>
          <button
            type="button"
            onClick={() => remove.mutate(rule.id)}
            disabled={remove.isPending}
            className="text-[13px] font-medium text-negative disabled:opacity-50"
          >
            Delete
          </button>
        </li>
      ))}
    </ul>
  );
}

function AuditLog() {
  const log = useAuditLog(15);

  return (
    <section>
      <h2 className="mb-1 text-[18px] font-semibold tracking-[-0.01em]">Activity</h2>
      <p className="mb-3 text-[13px] text-muted-foreground">
        Append-only record of changes to your financial data.
      </p>
      {log.isLoading ? (
        <RowSkeleton count={3} />
      ) : (log.data ?? []).length === 0 ? (
        <p className="rounded-card border border-border bg-card p-5 text-[14px] text-muted-foreground">
          Nothing recorded yet.
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-card text-[13px]">
          {(log.data ?? []).map((entry) => (
            <li key={entry.id} className="flex items-center justify-between gap-3 p-3.5">
              <span className="truncate font-medium">{entry.action}</span>
              <span className="shrink-0 text-muted-foreground">
                {new Date(entry.created_at).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export { Money };
