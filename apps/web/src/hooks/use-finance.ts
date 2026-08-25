"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { apiFetch } from "@/lib/api/client";
import { qk } from "@/lib/query";

export type Account = {
  id: string;
  name: string;
  type: string;
  subtype: string | null;
  currency: string;
  balance_current: number;
  balance_available: number | null;
  balance_limit: number | null;
  is_manual: boolean;
  is_hidden: boolean;
  include_in_net_worth: boolean;
  mask: string | null;
};

export type BalanceSummary = {
  assets: number;
  liabilities: number;
  net_worth: number;
  cash: number;
  investments: number;
  credit: number;
  currency: string;
};

export type Category = {
  id: string;
  name: string;
  slug: string;
  kind: string;
  icon: string | null;
  color: string | null;
};

export type Transaction = {
  id: string;
  account_id: string;
  amount: number;
  currency: string;
  date: string;
  name: string;
  merchant_name: string | null;
  category_id: string | null;
  notes: string | null;
  pending: boolean;
  is_split: boolean;
  is_transfer: boolean;
  exclude_from_budget: boolean;
  category_source: string | null;
};

type Page<T> = { data: T[]; next_cursor: string | null; has_more: boolean };

export function useAccounts() {
  return useQuery({
    queryKey: qk.accounts.list(),
    queryFn: () => apiFetch<Account[]>("/accounts"),
  });
}

export function useAccount(id: string) {
  return useQuery({
    queryKey: qk.accounts.detail(id),
    queryFn: () => apiFetch<Account>(`/accounts/${id}`),
  });
}

export function useBalanceSummary() {
  return useQuery({
    queryKey: qk.accounts.summary(),
    queryFn: () => apiFetch<BalanceSummary>("/accounts/summary"),
    staleTime: 60_000,
  });
}

export function useCategories() {
  return useQuery({
    queryKey: qk.categories.all(),
    queryFn: () => apiFetch<Category[]>("/categories"),
    staleTime: 10 * 60_000,
  });
}

/**
 * Cursor-paginated; offset pagination would skip rows as new ones arrive.
 *
 * The page size is part of the query key. Without it, two lists on different
 * page sizes would share a cache entry and whichever mounted first would
 * decide how many rows the other got.
 */
export function useTransactions(
  filters: Record<string, string> = {},
  limit = 25,
) {
  return useInfiniteQuery({
    queryKey: [...qk.transactions.list(filters), limit],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ ...filters, limit: String(limit) });
      if (pageParam) params.set("cursor", pageParam);
      return apiFetch<Page<Transaction>>(`/transactions?${params}`);
    },
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });
}

/** Any write touching accounts or transactions invalidates the rollups too. */
function useFinanceInvalidation() {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: qk.accounts.all() });
    void client.invalidateQueries({ queryKey: qk.transactions.all() });
  };
}

export function useCreateAccount() {
  const invalidate = useFinanceInvalidation();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch<Account>("/accounts", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: invalidate,
  });
}

export function useCreateTransaction() {
  const invalidate = useFinanceInvalidation();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch<Transaction>("/transactions", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: invalidate,
  });
}

export function useDeleteTransaction() {
  const invalidate = useFinanceInvalidation();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/transactions/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
}

// ------------------------------------------------------------ Phase 3 writes

export type Rule = {
  id: string;
  name: string;
  priority: number;
  is_active: boolean;
  conditions: Record<string, unknown>;
  actions: Record<string, unknown>;
};

/**
 * Optimistic patch.
 *
 * Recategorizing is the interaction that must feel instant, so the cached rows
 * are rewritten before the request lands and rolled back if it fails
 * (PLAN.md section 14).
 */
export function useUpdateTransaction() {
  const client = useQueryClient();
  const invalidate = useFinanceInvalidation();

  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) =>
      apiFetch<Transaction>(`/transactions/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),

    onMutate: async ({ id, ...patch }) => {
      await client.cancelQueries({ queryKey: qk.transactions.all() });
      const previous = client.getQueriesData({ queryKey: qk.transactions.all() });

      client.setQueriesData<{ pages: Page<Transaction>[] }>(
        { queryKey: qk.transactions.all() },
        (old) =>
          !old?.pages
            ? old
            : {
                ...old,
                pages: old.pages.map((page) => ({
                  ...page,
                  data: page.data.map((t) =>
                    t.id === id ? { ...t, ...(patch as Partial<Transaction>) } : t,
                  ),
                })),
              },
      );

      return { previous };
    },

    onError: (_err, _vars, context) => {
      // Put the cache back exactly as it was.
      context?.previous?.forEach(([key, data]) => client.setQueryData(key, data));
    },

    onSettled: invalidate,
  });
}

export function useSplitTransaction() {
  const invalidate = useFinanceInvalidation();
  return useMutation({
    mutationFn: ({
      id,
      parts,
    }: {
      id: string;
      parts: { amount: number; category_id: string | null; notes?: string }[];
    }) =>
      apiFetch<Transaction[]>(`/transactions/${id}/split`, {
        method: "POST",
        body: JSON.stringify({ parts }),
      }),
    onSuccess: invalidate,
  });
}

export function useUnsplitTransaction() {
  const invalidate = useFinanceInvalidation();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<Transaction>(`/transactions/${id}/split`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
}

export function useLinkTransfer() {
  const invalidate = useFinanceInvalidation();
  return useMutation({
    mutationFn: (transaction_ids: string[]) =>
      apiFetch<Transaction[]>("/transactions/link-transfer", {
        method: "POST",
        body: JSON.stringify({ transaction_ids }),
      }),
    onSuccess: invalidate,
  });
}

export function useUnlinkTransfer() {
  const invalidate = useFinanceInvalidation();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<Transaction[]>(`/transactions/${id}/transfer`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
}

export function useDetectTransfers() {
  const invalidate = useFinanceInvalidation();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ pairs_linked: number }>("/transactions/detect-transfers?days=90", {
        method: "POST",
      }),
    onSuccess: invalidate,
  });
}

export function useBulkCategorize() {
  const invalidate = useFinanceInvalidation();
  return useMutation({
    mutationFn: (body: {
      transaction_ids: string[];
      category_id: string;
      create_rule: boolean;
    }) =>
      apiFetch<{ updated: number; rule_id: string | null }>(
        "/transactions/bulk-categorize",
        { method: "POST", body: JSON.stringify(body) },
      ),
    onSuccess: invalidate,
  });
}

// ------------------------------------------------------------ Phase 4: Plaid

export type PlaidItem = {
  id: string;
  institution_name: string | null;
  institution_logo_url: string | null;
  status: string;
  last_successful_sync_at: string | null;
  last_error_code: string | null;
  created_at: string;
};

export type SyncRun = {
  id: string;
  plaid_item_id: string | null;
  kind: string;
  status: string;
  added: number;
  modified: number;
  removed: number;
  started_at: string;
  finished_at: string | null;
  error_code: string | null;
};

export function usePlaidItems() {
  return useQuery({
    queryKey: ["plaid", "items"],
    queryFn: () => apiFetch<PlaidItem[]>("/plaid/items"),
  });
}

export function useSyncRuns() {
  return useQuery({
    queryKey: ["plaid", "sync-runs"],
    queryFn: () => apiFetch<SyncRun[]>("/plaid/sync-runs?limit=10"),
  });
}

/** Fetched on demand: a link token is short-lived, so it is never cached. */
export function useCreateLinkToken() {
  return useMutation({
    mutationFn: (body: { mode: "connect" | "update"; item_id?: string }) =>
      apiFetch<{ link_token: string }>("/plaid/link-token", {
        method: "POST",
        body: JSON.stringify(body),
      }),
  });
}

export function useExchangePublicToken() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      public_token: string;
      institution_id?: string | null;
      institution_name?: string | null;
    }) =>
      apiFetch<PlaidItem>("/plaid/exchange", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    // A new institution can change every number on screen.
    onSuccess: () => void client.invalidateQueries(),
  });
}

export function useSyncItem() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) =>
      apiFetch<{ added: number; modified: number; removed: number; status: string }>(
        `/plaid/items/${itemId}/sync`,
        { method: "POST" },
      ),
    onSuccess: () => void client.invalidateQueries(),
  });
}

export function useRemovePlaidItem() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) =>
      apiFetch<void>(`/plaid/items/${itemId}`, { method: "DELETE" }),
    onSuccess: () => void client.invalidateQueries(),
  });
}

// -------------------------------------------------------- Phase 5: dashboard

export type DashboardSummary = {
  assets: number;
  liabilities: number;
  net_worth: number;
  cash: number;
  investments: number;
  credit: number;
  month: string;
  monthly_income: number;
  monthly_spending: number;
  monthly_net: number;
  previous_month_income: number;
  previous_month_spending: number;
  net_worth_change: number | null;
  currency: string;
};

export type NetWorthPoint = {
  date: string;
  net_worth: number;
  assets: number;
  liabilities: number;
};

export type CategorySpend = {
  category_id: string | null;
  name: string;
  color: string | null;
  amount: number;
};

export type CashFlowPoint = {
  month: string;
  income: number;
  spending: number;
  net: number;
};

export type NetWorthRange = "1m" | "3m" | "6m" | "ytd" | "1y" | "all";

export function useDashboardSummary() {
  return useQuery({
    queryKey: ["dashboard", "summary"],
    queryFn: () => apiFetch<DashboardSummary>("/dashboard/summary"),
    staleTime: 60_000,
  });
}

export function useNetWorthSeries(range: NetWorthRange) {
  return useQuery({
    queryKey: ["dashboard", "net-worth", range],
    queryFn: () => apiFetch<NetWorthPoint[]>(`/dashboard/net-worth?range=${range}`),
    // Daily granularity — refetching more often cannot change the answer.
    staleTime: 5 * 60_000,
  });
}

export function useSpendingByCategory() {
  return useQuery({
    queryKey: ["dashboard", "spending-by-category"],
    queryFn: () => apiFetch<CategorySpend[]>("/dashboard/spending-by-category"),
    staleTime: 60_000,
  });
}

export function useCashFlow(months = 6) {
  return useQuery({
    queryKey: ["dashboard", "cash-flow", months],
    queryFn: () => apiFetch<CashFlowPoint[]>(`/dashboard/cash-flow?months=${months}`),
    staleTime: 60_000,
  });
}

export function useRecentTransactions(limit = 5) {
  return useQuery({
    queryKey: ["dashboard", "recent", limit],
    queryFn: () =>
      apiFetch<Transaction[]>(`/dashboard/recent-transactions?limit=${limit}`),
  });
}

/** Writes today's snapshot and backfills, so a new account charts immediately. */
export function useTakeSnapshot() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ backfilled: number }>("/dashboard/snapshot", { method: "POST" }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["dashboard"] }),
  });
}

// ---------------------------------------------------------- Phase 6: budgets

export type BudgetLine = {
  category_id: string;
  name: string;
  color: string | null;
  budgeted: number;
  spent: number;
  remaining: number;
  percent: number;
  over: boolean;
};

export type UnbudgetedSpend = {
  category_id: string;
  name: string;
  color: string | null;
  spent: number;
};

export type BudgetProgress = {
  month: string;
  exists: boolean;
  total_income_expected: number | null;
  note: string | null;
  total_budgeted: number;
  total_spent: number;
  total_remaining: number;
  categories: BudgetLine[];
  unbudgeted: UnbudgetedSpend[];
  unbudgeted_spent: number;
};

export type BudgetSuggestion = {
  category_id: string;
  name: string;
  color: string | null;
  suggested: number;
};

export function useBudget(month: string) {
  return useQuery({
    queryKey: ["budgets", month],
    queryFn: () => apiFetch<BudgetProgress>(`/budgets/${month}`),
    staleTime: 30_000,
  });
}

export function useBudgetSuggestions(month: string, enabled: boolean) {
  return useQuery({
    queryKey: ["budgets", month, "suggestions"],
    queryFn: () => apiFetch<BudgetSuggestion[]>(`/budgets/${month}/suggestions`),
    enabled,
    staleTime: 5 * 60_000,
  });
}

function useBudgetInvalidation() {
  const client = useQueryClient();
  return () => void client.invalidateQueries({ queryKey: ["budgets"] });
}

export function useSetBudgetCategory(month: string) {
  const invalidate = useBudgetInvalidation();
  return useMutation({
    mutationFn: ({ categoryId, amount }: { categoryId: string; amount: number }) =>
      apiFetch<BudgetProgress>(`/budgets/${month}/categories/${categoryId}`, {
        method: "PATCH",
        body: JSON.stringify({ amount }),
      }),
    onSuccess: invalidate,
  });
}

export type DailySpendPoint = {
  date: string;
  spent: number;
  /** Spend from the 1st through this day. */
  cumulative: number;
};

export function useDailySpend(month: string) {
  return useQuery({
    queryKey: ["budgets", month, "daily"],
    queryFn: () => apiFetch<DailySpendPoint[]>(`/budgets/${month}/daily`),
    staleTime: 60_000,
  });
}

export function useDeleteBudget(month: string) {
  const invalidate = useBudgetInvalidation();
  return useMutation({
    mutationFn: () =>
      apiFetch<void>(`/budgets/${month}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
}

export function useUpsertBudget(month: string) {
  const invalidate = useBudgetInvalidation();
  return useMutation({
    mutationFn: (body: {
      categories: { category_id: string; amount: number }[];
      total_income_expected?: number | null;
    }) =>
      apiFetch<BudgetProgress>(`/budgets/${month}`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: invalidate,
  });
}

export function useCopyBudget(month: string) {
  const invalidate = useBudgetInvalidation();
  return useMutation({
    mutationFn: (source: string) =>
      apiFetch<BudgetProgress>(`/budgets/${month}/copy-from?source=${source}`, {
        method: "POST",
      }),
    onSuccess: invalidate,
  });
}

// --------------------------------------------- Phase 7: investments & cash flow

export type InvestmentSummary = {
  total_value: number;
  /**
   * Value of only the positions that have a cost basis. `total_value` also
   * includes cash and margin, which have none, so `total_value -
   * total_cost_basis` is not the gain and must never be shown as if it were.
   */
  invested_value: number;
  total_cost_basis: number;
  total_gain: number;
  total_gain_percent: number | null;
  positions_without_cost_basis: number;
  day_change: number | null;
  holdings_count: number;
  currency: string;
};

export type HoldingRow = {
  id: string;
  account_id: string;
  account_name: string;
  ticker: string | null;
  name: string;
  asset_class: string;
  quantity: string;
  price: number | null;
  value: number;
  /** The basis in use: your override when set, otherwise Plaid's. */
  cost_basis: number | null;
  cost_basis_is_override: boolean;
  /** What Plaid reports, kept so a correction can be compared to what it replaced. */
  plaid_cost_basis: number | null;
  gain: number | null;
  gain_percent: number | null;
  currency: string;
};

export type AllocationSlice = {
  name: string;
  value: number;
  percent: number;
  color: string;
};

export type PerformancePoint = { date: string; value: number; cost_basis: number | null };

export type CategoryTotal = {
  category_id: string | null;
  name: string;
  color: string | null;
  amount: number;
  transaction_count: number;
};

export type TrendPoint = {
  month: string;
  income: number;
  spending: number;
  net: number;
  spending_avg_3m: number;
  income_avg_3m: number;
};

export type CashFlowSummary = {
  months: number;
  total_income: number;
  total_spending: number;
  net: number;
  average_income: number;
  average_spending: number;
  average_net: number;
  best_month: string | null;
  worst_month: string | null;
  currency: string;
};

export function useSetCostBasis() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, costBasis }: { id: string; costBasis: number | null }) =>
      apiFetch<HoldingRow>(`/investments/holdings/${id}/cost-basis`, {
        method: "PATCH",
        body: JSON.stringify({ cost_basis: costBasis }),
      }),
    onSuccess: () => {
      // The summary totals are derived from the same basis, so both move.
      void qc.invalidateQueries({ queryKey: ["investments"] });
    },
  });
}

export function useInvestmentSummary() {
  return useQuery({
    queryKey: ["investments", "summary"],
    queryFn: () => apiFetch<InvestmentSummary>("/investments/summary"),
    staleTime: 5 * 60_000,
  });
}

export function useHoldings() {
  return useQuery({
    queryKey: ["investments", "holdings"],
    queryFn: () => apiFetch<HoldingRow[]>("/investments/holdings"),
    staleTime: 5 * 60_000,
  });
}

export function useAllocation(groupBy: "asset_class" | "account" | "security") {
  return useQuery({
    queryKey: ["investments", "allocation", groupBy],
    queryFn: () =>
      apiFetch<AllocationSlice[]>(`/investments/allocation?group_by=${groupBy}`),
    staleTime: 5 * 60_000,
  });
}

export function useInvestmentPerformance(days = 180) {
  return useQuery({
    queryKey: ["investments", "performance", days],
    queryFn: () => apiFetch<PerformancePoint[]>(`/investments/performance?days=${days}`),
    staleTime: 5 * 60_000,
  });
}

export function useSyncInvestments() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ items_synced: number; holdings_added: number }>("/investments/sync", {
        method: "POST",
      }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["investments"] }),
  });
}

export function useCashFlowSummary(months = 12) {
  return useQuery({
    queryKey: ["cash-flow", "summary", months],
    queryFn: () => apiFetch<CashFlowSummary>(`/cash-flow/summary?months=${months}`),
    staleTime: 60_000,
  });
}

export function useCashFlowTrends(months = 12) {
  return useQuery({
    queryKey: ["cash-flow", "trends", months],
    queryFn: () => apiFetch<TrendPoint[]>(`/cash-flow/trends?months=${months}`),
    staleTime: 60_000,
  });
}

/**
 * The window a cash-flow view is showing, as ISO dates.
 *
 * Computed here rather than left to the server default so the same range can
 * be handed to a transactions link: a category row that says "14
 * transactions" has to open a list containing exactly those fourteen, and it
 * cannot if the two sides pick their own windows.
 *
 * Matches the server: the first of the month `months - 1` ago, through the
 * last day of the current month.
 */
export function cashFlowWindow(months: number): { from: string; to: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { from: iso(start), to: iso(end) };
}

export function useCashFlowByCategory(kind: "income" | "expense", months = 6) {
  const { from, to } = cashFlowWindow(months);
  return useQuery({
    queryKey: ["cash-flow", "by-category", kind, from, to],
    queryFn: () =>
      apiFetch<CategoryTotal[]>(
        `/cash-flow/by-category?kind=${kind}&from=${from}&to=${to}`,
      ),
    staleTime: 60_000,
  });
}

// -------------------------------------------------------- Phase 8: settings

export type Preferences = {
  currency: string;
  theme: string;
  week_starts_on: number;
  timezone: string;
};

export type AuditEntry = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  created_at: string;
};

export function usePreferences() {
  return useQuery({
    queryKey: ["preferences"],
    queryFn: () => apiFetch<Preferences>("/preferences"),
    staleTime: 5 * 60_000,
  });
}

export function useUpdatePreferences() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Preferences>) =>
      apiFetch<Preferences>("/preferences", {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["preferences"] }),
  });
}

export function useAuditLog(limit = 25) {
  return useQuery({
    queryKey: ["audit-log", limit],
    queryFn: () => apiFetch<AuditEntry[]>(`/audit-log?limit=${limit}`),
  });
}

/** Category management reuses the existing list query. */
export function useCreateCategory() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; slug: string; kind: string; color?: string }) =>
      apiFetch<Category>("/categories", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => void client.invalidateQueries({ queryKey: qk.categories.all() }),
  });
}

export function useUpdateCategory() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) =>
      apiFetch<Category>(`/categories/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: () => void client.invalidateQueries({ queryKey: qk.categories.all() }),
  });
}

export function useRules() {
  return useQuery({
    queryKey: ["rules"],
    queryFn: () => apiFetch<Rule[]>("/rules"),
  });
}

export function useDeleteRule() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/rules/${id}`, { method: "DELETE" }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["rules"] }),
  });
}
