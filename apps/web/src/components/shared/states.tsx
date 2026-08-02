"use client";

import { AlertCircle } from "lucide-react";

import { cn } from "@/lib/utils";

/** Skeletons preserve layout; spinners cause the shift that feels cheap. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} />;
}

export function RowSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="divide-y divide-border rounded-card border border-border bg-card">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-4">
          <Skeleton className="size-9 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="h-3.5 w-16" />
        </div>
      ))}
    </div>
  );
}

/** Card-level failure: the rest of the page keeps working. */
export function ErrorState({
  message = "Couldn't load this.",
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center rounded-card border border-border bg-card px-6 py-12 text-center">
      <AlertCircle className="size-5 text-negative" strokeWidth={2} />
      <p className="mt-3 text-[15px] font-medium">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 text-[14px] font-medium text-primary underline-offset-4 hover:underline"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}
