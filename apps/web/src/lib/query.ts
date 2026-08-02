import { QueryClient } from "@tanstack/react-query";

/**
 * Stale times are tuned to how fast each thing actually changes (PLAN.md 14).
 * Retrying a 4xx is never useful, so retries are limited to server/network
 * failures.
 */
export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: true,
        retry: (failureCount, error) => {
          const status = (error as { status?: number })?.status;
          if (status && status >= 400 && status < 500) return false;
          return failureCount < 3;
        },
      },
      mutations: { retry: false },
    },
  });
}

/** Query key factory — no stringly-typed keys anywhere else. */
export const qk = {
  accounts: {
    all: () => ["accounts"] as const,
    list: (params?: Record<string, unknown>) => ["accounts", "list", params ?? {}] as const,
    detail: (id: string) => ["accounts", id] as const,
    summary: () => ["accounts", "summary"] as const,
    transactions: (id: string) => ["accounts", id, "transactions"] as const,
  },
  categories: {
    all: () => ["categories"] as const,
  },
  transactions: {
    all: () => ["transactions"] as const,
    list: (filters: Record<string, unknown>) => ["transactions", "list", filters] as const,
    detail: (id: string) => ["transactions", id] as const,
  },
} as const;
