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
      {/* The search row sticks; the expanded panel below does not.
          Spending puts two charts above this list, so on the way down the
          controls would otherwise scroll away and searching would mean
          scrolling back up past both of them.

          Bled to full width with -mx-4 (-mx-8 on desktop, matching the
          layout's padding): inset by the page gutters, rows would show through
          the 16px either side as they passed underneath. z-30 stays below the
          tab bar's z-50. */}
      <div className="sticky top-0 z-30 -mx-4 bg-background px-4 py-2 lg:-mx-8 lg:px-8">
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
      </div>

      {open ? (
        <Card className="space-y-4 p-4">
          <div className="grid grid-cols-2 gap-3">
            <DateField
              label="From"
              value={filters.from}
              onChange={(value) => void setFilters({ from: value })}
            />
            <DateField
              label="To"
              value={filters.to}
              onChange={(value) => void setFilters({ to: value })}
            />
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

/**
 * A date input that shows something when it is empty.
 *
 * iOS renders an empty `type="date"` with no placeholder at all — no
 * mm/dd/yyyy, no glyph — so the two fields read as blank boxes with no hint
 * that they are dates or that empty means unbounded. Declaring color-scheme
 * fixed the chrome's colour but not this: there is simply nothing drawn to
 * colour. So the placeholder is ours, overlaid while the value is empty and
 * inert to pointer events so taps still reach the field underneath.
 *
 * appearance-none stops iOS imposing its own height on the control, which
 * otherwise ignores h-10 and leaves the two fields different sizes.
 */
function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string | null) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium">{label}</span>
      <span className="relative block">
        <input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value || null)}
          className="h-10 w-full appearance-none rounded-[12px] border border-input bg-background px-3 text-left text-[14px] outline-none focus:border-ring"
        />
        {value ? null : (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[14px] text-muted-foreground"
          >
            Any
          </span>
        )}
      </span>
    </label>
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
      {/* No max-height. A capped scroll area cut the last row of chips in
          half with nothing to say it scrolled — on touch there is no
          scrollbar to see, so it read as clipped rather than scrollable, and
          nesting a scroller inside the page scroll fights the gesture. The
          panel is opt-in, so letting it be as tall as it needs is cheaper
          than hiding half a row. */}
      <div className="flex flex-wrap gap-1.5">
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
