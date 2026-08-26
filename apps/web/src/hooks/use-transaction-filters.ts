"use client";

import {
  parseAsArrayOf,
  parseAsBoolean,
  parseAsString,
  useQueryStates,
} from "nuqs";

/**
 * Transaction filters live in the URL, not component state.
 *
 * That makes a filtered view shareable and the back button correct, and the
 * same object doubles as the TanStack Query key (PLAN.md section 14).
 */
export function useTransactionFilters() {
  const [filters, setFilters] = useQueryStates(
    {
      q: parseAsString.withDefault(""),
      from: parseAsString.withDefault(""),
      to: parseAsString.withDefault(""),
      accounts: parseAsArrayOf(parseAsString).withDefault([]),
      categories: parseAsArrayOf(parseAsString).withDefault([]),
      uncategorized: parseAsBoolean.withDefault(false),
      hideTransfers: parseAsBoolean.withDefault(false),
    },
    // Typing in the search box should not push a history entry per keystroke.
    { history: "replace", shallow: true, throttleMs: 300 },
  );

  /**
   * Only non-empty values, so the query key stays stable.
   *
   * The multi-select filters stay as arrays rather than being joined. FastAPI
   * reads `list[UUID]` from repeated params — `?category_ids=a&category_ids=b`
   * — so a comma-joined "a,b" arrived as one value, failed UUID validation,
   * and 422'd the whole request. Picking a second category emptied the list,
   * which looked like the filter had become an AND.
   */
  const params: Record<string, string | string[]> = {};
  if (filters.q) params.q = filters.q;
  if (filters.from) params.from = filters.from;
  if (filters.to) params.to = filters.to;
  if (filters.accounts.length) params.account_ids = filters.accounts;
  if (filters.categories.length) params.category_ids = filters.categories;
  if (filters.uncategorized) params.uncategorized = "true";
  if (filters.hideTransfers) params.include_transfers = "false";

  const activeCount =
    (filters.q ? 1 : 0) +
    (filters.from || filters.to ? 1 : 0) +
    (filters.accounts.length ? 1 : 0) +
    (filters.categories.length ? 1 : 0) +
    (filters.uncategorized ? 1 : 0) +
    (filters.hideTransfers ? 1 : 0);

  function clear() {
    void setFilters({
      q: null,
      from: null,
      to: null,
      accounts: null,
      categories: null,
      uncategorized: null,
      hideTransfers: null,
    });
  }

  return { filters, setFilters, params, activeCount, clear };
}
