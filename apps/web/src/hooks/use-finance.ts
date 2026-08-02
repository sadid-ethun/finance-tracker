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
  is_transfer: boolean;
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
