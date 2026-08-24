"use client";

import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useCallback, useRef, useState } from "react";

const THRESHOLD = 72;
/**
 * Resistance. Without damping the sheet tracks the finger 1:1 and feels like
 * dragging a div; native pull-to-refresh gets progressively harder, which is
 * what tells you a threshold exists before you reach it.
 */
const RESISTANCE = 0.45;

/**
 * Pull-to-refresh for touch devices.
 *
 * Engages only at the top of the page and only on a downward drag, so it can
 * never swallow an ordinary scroll. Mouse and trackpad are untouched: there
 * is no gesture to make, and a desktop user has the browser's own reload.
 */
export function PullToRefresh({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);

  const onTouchStart = useCallback((event: React.TouchEvent) => {
    // Only from a genuine top-of-page. Starting mid-scroll would hijack the
    // scroll the user was actually performing.
    if (window.scrollY > 0 || refreshing) {
      startY.current = null;
      return;
    }
    startY.current = event.touches[0]?.clientY ?? null;
  }, [refreshing]);

  const onTouchMove = useCallback((event: React.TouchEvent) => {
    if (startY.current === null) return;
    const delta = (event.touches[0]?.clientY ?? 0) - startY.current;
    if (delta <= 0) {
      // Upward: hand it back to the scroller rather than fighting it.
      setPull(0);
      startY.current = null;
      return;
    }
    setPull(Math.min(delta * RESISTANCE, THRESHOLD * 1.5));
  }, []);

  const onTouchEnd = useCallback(async () => {
    const reached = pull >= THRESHOLD;
    startY.current = null;
    setPull(0);
    if (!reached || refreshing) return;

    setRefreshing(true);
    try {
      // Everything on screen, not one query: the dashboard is several
      // independent cards and refreshing only one leaves the rest stale
      // behind a gesture that said "update this page".
      await queryClient.refetchQueries({ type: "active" });
    } finally {
      setRefreshing(false);
    }
  }, [pull, refreshing, queryClient]);

  const offset = refreshing ? THRESHOLD * 0.6 : pull;
  const armed = pull >= THRESHOLD;

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      // Contains the native rubber-band, which would otherwise scroll the
      // page away underneath the gesture on iOS.
      className="overscroll-y-contain"
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
