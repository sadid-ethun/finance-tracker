"use client";

import { useState } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";

import { Card } from "@/components/shared/card";
import { useAccounts, useCategories } from "@/hooks/use-finance";
import { useTransactionFilters } from "@/hooks/use-transaction-filters";
import { cn } from "@/lib/utils";

/**
 * Filter bar. Every control writes to the URL, so a filtered view can be
 * shared, bookmarked, and reached with the back button.
 */
export function TransactionFilters() {
  const { filters, setFilters, activeCount, clear } = useTransactionFilters();
  const [open, setOpen] = useState(false);
  const accounts = useAccounts();
  const categories = useCategories();

  function toggleIn(list: string[], id: string): string[] | null {
    const next = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
    return next.length ? next : null;
  }

  return (
    <div className="mb-4 space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            strokeWidth={2}
          />
          <input
            type="search"
            value={filters.q}
            onChange={(e) => void setFilters({ q: e.target.value || null })}
            placeholder="Search transactions"
            aria-label="Search transactions"
            className="h-11 w-full rounded-[14px] border border-input bg-card pr-3 pl-9 text-[15px] outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
          />
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={cn(
            "relative inline-flex h-11 items-center gap-1.5 rounded-[14px] border px-3.5 text-[14px] font-medium",
            activeCount > 0
              ? "border-primary bg-accent text-accent-foreground"
              : "border-border bg-card",
          )}
        >
          <SlidersHorizontal className="size-4" strokeWidth={2} />
          Filters
          {activeCount > 0 ? (
            <span className="tabular ml-0.5 rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
              {activeCount}
            </span>
          ) : null}
        </button>
      </div>

      {open ? (
        <Card className="space-y-4 p-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium">From</span>
              <input
                type="date"
                value={filters.from}
                onChange={(e) => void setFilters({ from: e.target.value || null })}
                className="h-10 w-full rounded-[12px] border border-input bg-background px-3 text-[14px] outline-none focus:border-ring"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium">To</span>
              <input
                type="date"
                value={filters.to}
                onChange={(e) => void setFilters({ to: e.target.value || null })}
                className="h-10 w-full rounded-[12px] border border-input bg-background px-3 text-[14px] outline-none focus:border-ring"
              />
            </label>
          </div>

          <FilterChips
            label="Accounts"
            items={(accounts.data ?? []).map((a) => ({ id: a.id, label: a.name }))}
            selected={filters.accounts}
            onToggle={(id) =>
              void setFilters({ accounts: toggleIn(filters.accounts, id) })
            }
          />

          <FilterChips
            label="Categories"
            items={(categories.data ?? []).map((c) => ({
              id: c.id,
              label: c.name,
              color: c.color ?? undefined,
            }))}
            selected={filters.categories}
            onToggle={(id) =>
              void setFilters({ categories: toggleIn(filters.categories, id) })
            }
          />

          <div className="flex flex-wrap gap-2">
            <Toggle
              active={filters.uncategorized}
              onClick={() =>
                void setFilters({ uncategorized: filters.uncategorized ? null : true })
              }
            >
              Uncategorized only
            </Toggle>
            <Toggle
              active={filters.hideTransfers}
              onClick={() =>
                void setFilters({ hideTransfers: filters.hideTransfers ? null : true })
              }
            >
              Hide transfers
            </Toggle>
          </div>

          {activeCount > 0 ? (
            <button
              type="button"
              onClick={clear}
              className="inline-flex items-center gap-1 text-[14px] font-medium text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" /> Clear all filters
            </button>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}

function FilterChips({
  label,
  items,
  selected,
  onToggle,
}: {
  label: string;
  items: { id: string; label: string; color?: string }[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  if (items.length === 0) return null;

  return (
    <div>
      <p className="mb-1.5 text-[13px] font-medium">{label}</p>
      <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
        {items.map((item) => (
          <Toggle
            key={item.id}
            active={selected.includes(item.id)}
            onClick={() => onToggle(item.id)}
          >
            {item.color ? (
              <span
                aria-hidden
                className="size-2 rounded-full"
                style={{ backgroundColor: item.color }}
              />
            ) : null}
            {item.label}
          </Toggle>
        ))}
      </div>
    </div>
  );
}

function Toggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors",
        active
          ? "border-primary bg-accent text-accent-foreground"
          : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
