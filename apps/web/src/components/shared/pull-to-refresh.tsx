"use client";

import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useCallback, useRef, useState } from "react";

import { PULL_THRESHOLD, pullFor } from "@/lib/pull-to-refresh";
import { cn } from "@/lib/utils";

/**
 * Pull-to-refresh for touch devices.
 *
 * Engages only at the top of the page and only on a downward drag, so it can
 * never swallow an ordinary scroll. Mouse and trackpad are untouched: there is
 * no gesture to make, and desktop has the Refresh card under Settings -> Data
 * plus the browser's own reload.
 *
 * This refetches; it does not sync a bank. Pulling new activity from an
 * institution is per-connection, on Accounts, and syncing holdings is the
 * button on Portfolio — both hit the API, which a client refetch cannot do.
 */
export function PullToRefresh({
  children,
  className,
}: {
  children: React.ReactNode;
  /**
   * Layout classes for the wrapper. This element sits between a flex parent
   * and a flex child, so it has to carry the chain across itself — without
   * that, the content below stops stretching to fill the viewport.
   */
  className?: string;
}) {
  const queryClient = useQueryClient();
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);

  const onTouchStart = useCallback(
    (event: React.TouchEvent) => {
      // Only from a genuine top-of-page. Starting mid-scroll would hijack the
      // scroll the user was actually performing.
      if (window.scrollY > 0 || refreshing) {
        startY.current = null;
        return;
      }
      startY.current = event.touches[0]?.clientY ?? null;
    },
    [refreshing],
  );

  const onTouchMove = useCallback((event: React.TouchEvent) => {
    if (startY.current === null) return;
    const delta = (event.touches[0]?.clientY ?? 0) - startY.current;
    if (delta <= 0) {
      // Upward: hand it back to the scroller rather than fighting it.
      setPull(0);
      startY.current = null;
      return;
    }
    setPull(pullFor(delta));
  }, []);

  const onTouchEnd = useCallback(async () => {
    const reached = pull >= PULL_THRESHOLD;
    startY.current = null;
    setPull(0);
    if (!reached || refreshing) return;

    setRefreshing(true);
    try {
      // Everything on screen, not one query: a screen is several independent
      // cards, and refreshing one leaves the rest stale behind a gesture that
      // said "update this page".
      await queryClient.refetchQueries({ type: "active" });
    } finally {
      setRefreshing(false);
    }
  }, [pull, refreshing, queryClient]);

  const offset = refreshing ? PULL_THRESHOLD * 0.6 : pull;
  const armed = pull >= PULL_THRESHOLD;

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      className={cn("overscroll-y-contain", className)}
    >
      <div
        aria-hidden={!refreshing}
        className="pointer-events-none flex items-center justify-center overflow-hidden transition-[height] duration-200"
        style={{ height: offset }}
      >
        <RefreshCw
          className={[
            "size-4 text-muted-foreground transition-colors",
            armed || refreshing ? "text-foreground" : "",
            refreshing ? "motion-safe:animate-spin" : "",
          ].join(" ")}
          strokeWidth={2}
          // Rotates with the pull so the gesture has continuous feedback
          // rather than snapping state at the threshold.
          style={refreshing ? undefined : { transform: `rotate(${pull * 3}deg)` }}
        />
        <span className="sr-only" role="status">
          {refreshing ? "Refreshing" : armed ? "Release to refresh" : ""}
        </span>
      </div>

      {children}
    </div>
  );
}
