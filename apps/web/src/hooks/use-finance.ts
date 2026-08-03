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
