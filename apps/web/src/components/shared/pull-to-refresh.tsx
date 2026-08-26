"use client";

import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

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
 *
 * ## Why it is built this way
 *
 * The first version put the pull distance in React state and animated the
 * indicator's `height`. Both are wrong for a gesture tracking a finger.
 *
 * `height` is a layout property: every frame reflowed the whole page — on
 * Spending, two charts and a transaction list — and then repainted it. And
 * setState per touchmove meant a full render pass per frame to drive it, on
 * the same thread as the scroll.
 *
 * So the finger drives a transform instead, written straight to the node in
 * the touch handler, and read back through requestAnimationFrame. Transforms
 * are composited: no layout, no paint. React only hears about the gesture
 * when it crosses a threshold that changes what is rendered, which is at most
 * twice per pull rather than sixty times a second.
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
  const [refreshing, setRefreshing] = useState(false);
  const [armed, setArmed] = useState(false);

  const surface = useRef<HTMLDivElement | null>(null);
  const indicator = useRef<HTMLDivElement | null>(null);
  const startY = useRef<number | null>(null);
  const pull = useRef(0);
  const frame = useRef<number | null>(null);

  /** Writes the current pull to the DOM. Composited; never touches React. */
  const paint = useCallback((distance: number, animate: boolean) => {
    const content = surface.current;
    const spinner = indicator.current;
    if (!content || !spinner) return;

    const easing = animate ? "transform 200ms cubic-bezier(0.32, 0.72, 0, 1)" : "";
    content.style.transition = easing;
    content.style.transform = `translate3d(0, ${distance}px, 0)`;
    spinner.style.transition = easing;
    spinner.style.transform = `translate3d(0, ${distance}px, 0) rotate(${distance * 3}deg)`;
    spinner.style.opacity = String(Math.min(1, distance / PULL_THRESHOLD));
  }, []);

  const schedule = useCallback(() => {
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      paint(pull.current, false);
    });
  }, [paint]);

  // A gesture interrupted by unmount would otherwise leave a frame queued
  // against a detached node.
  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  const onTouchStart = useCallback((event: React.TouchEvent) => {
    // Only from a genuine top-of-page. Starting mid-scroll would hijack the
    // scroll the user was actually performing.
    if (window.scrollY > 0 || refreshing) {
      startY.current = null;
      return;
    }
    startY.current = event.touches[0]?.clientY ?? null;
  }, [refreshing]);

  const onTouchMove = useCallback(
    (event: React.TouchEvent) => {
      if (startY.current === null) return;
      const delta = (event.touches[0]?.clientY ?? 0) - startY.current;
      if (delta <= 0) {
        // Upward: hand it back to the scroller rather than fighting it.
        startY.current = null;
        pull.current = 0;
        setArmed(false);
        paint(0, true);
        return;
      }

      pull.current = pullFor(delta);
      // Only when the label under it changes — not per frame.
      setArmed((was) => {
        const now = pull.current >= PULL_THRESHOLD;
        return now === was ? was : now;
      });
      schedule();
    },
    [paint, schedule],
  );

  const onTouchEnd = useCallback(async () => {
    const reached = pull.current >= PULL_THRESHOLD;
    startY.current = null;
    pull.current = 0;
    setArmed(false);

    if (!reached || refreshing) {
      paint(0, true);
      return;
    }

    setRefreshing(true);
    // Rests at the threshold while the work runs, then springs back.
    paint(PULL_THRESHOLD * 0.6, true);
    try {
      // Everything on screen, not one query: a screen is several independent
      // cards, and refreshing one leaves the rest stale behind a gesture that
      // said "update this page".
      await queryClient.refetchQueries({ type: "active" });
    } finally {
      setRefreshing(false);
      paint(0, true);
    }
  }, [paint, refreshing, queryClient]);

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      className={cn("relative overscroll-y-contain", className)}
    >
      {/* Out of flow, so revealing it moves nothing: the old version grew a
          spacer's height and pushed the page down on every frame. */}
      <div
        ref={indicator}
        aria-hidden={!refreshing}
        className="pointer-events-none absolute inset-x-0 top-0 flex h-10 items-center justify-center opacity-0"
        style={{ willChange: "transform, opacity" }}
      >
        <RefreshCw
          className={cn(
            "size-4",
            armed || refreshing ? "text-foreground" : "text-muted-foreground",
            refreshing && "motion-safe:animate-spin",
          )}
          strokeWidth={2}
        />
        <span className="sr-only" role="status">
          {refreshing ? "Refreshing" : armed ? "Release to refresh" : ""}
        </span>
      </div>

      <div ref={surface} style={{ willChange: "transform" }} className={className}>
        {children}
      </div>
    </div>
  );
}
