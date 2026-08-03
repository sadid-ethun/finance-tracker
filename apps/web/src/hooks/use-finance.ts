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

/** Cursor-paginated; offset pagination would skip rows as new ones arrive. */
export function useTransactions(filters: Record<string, string> = {}) {
  return useInfiniteQuery({
    queryKey: qk.transactions.list(filters),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ ...filters, limit: "25" });
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

export type NetWorthRange = "1m" | "3m" | "6m" | "1y" | "all";

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
