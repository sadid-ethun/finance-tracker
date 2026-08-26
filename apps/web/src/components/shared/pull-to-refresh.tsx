"use client";

import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { PULL_THRESHOLD, pullFor } from "@/lib/pull-to-refresh";
import { cn } from "@/lib/utils";

/** Finger travel before the gesture is claimed as a pull rather than a tap. */
const CLAIM_AT = 4;

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
 * **Native listeners, not React's.** React registers touchmove passively, so
 * `preventDefault` inside `onTouchMove` does nothing. That left the browser
 * free to claim the gesture as an overscroll — and on a quick flick it claimed
 * it before we had seen a single move, cancelling the sequence with the pull
 * still at zero. A slow drag worked; a fast one silently did nothing. These
 * are registered with `{ passive: false }` so the pull can be claimed.
 *
 * **Transforms, not height.** The first version animated the indicator's
 * `height` from React state: a layout pass over the whole page and a full
 * render, per frame, on the same thread as the scroll. The finger now drives a
 * transform written straight to the node and read back through
 * requestAnimationFrame. React hears about the gesture only when it crosses
 * the threshold — twice per pull rather than sixty times a second.
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

  const root = useRef<HTMLDivElement | null>(null);
  const surface = useRef<HTMLDivElement | null>(null);
  const indicator = useRef<HTMLDivElement | null>(null);

  const startY = useRef<number | null>(null);
  const claimed = useRef(false);
  const pull = useRef(0);
  const frame = useRef<number | null>(null);
  // The native listeners are bound once; state read inside them has to come
  // from a ref or the closure would keep seeing the first render's value.
  const busy = useRef(false);

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

  const runRefresh = useCallback(async () => {
    busy.current = true;
    setRefreshing(true);
    // Rests at the threshold while the work runs, then springs back.
    paint(PULL_THRESHOLD * 0.6, true);
    try {
      // Everything on screen, not one query: a screen is several independent
      // cards, and refreshing one leaves the rest stale behind a gesture that
      // said "update this page".
      await queryClient.refetchQueries({ type: "active" });
    } finally {
      busy.current = false;
      setRefreshing(false);
      paint(0, true);
    }
  }, [paint, queryClient]);

  useEffect(() => {
    const node = root.current;
    if (!node) return;

    const release = () => {
      startY.current = null;
      claimed.current = false;
      pull.current = 0;
      setArmed(false);
    };

    const onStart = (event: TouchEvent) => {
      // Only from a genuine top-of-page. Starting mid-scroll would hijack the
      // scroll the user was actually performing.
      if (window.scrollY > 0 || busy.current) {
        release();
        return;
      }
      startY.current = event.touches[0]?.clientY ?? null;
      claimed.current = false;
    };

    const onMove = (event: TouchEvent) => {
      if (startY.current === null || busy.current) return;
      const delta = (event.touches[0]?.clientY ?? 0) - startY.current;

      if (delta <= 0) {
        // Upward: hand it back to the scroller rather than fighting it.
        if (claimed.current) paint(0, true);
        release();
        return;
      }

      // The page can only rubber-band here, never scroll, so taking the
      // gesture costs the user nothing — and not taking it is what let a
      // fast flick get cancelled out from under us.
      if (!claimed.current && delta > CLAIM_AT) claimed.current = true;
      if (!claimed.current) return;

      if (event.cancelable) event.preventDefault();

      pull.current = pullFor(delta);
      // Only when the label under it changes — not per frame.
      setArmed((was) => {
        const now = pull.current >= PULL_THRESHOLD;
        return now === was ? was : now;
      });

      if (frame.current === null) {
        frame.current = requestAnimationFrame(() => {
          frame.current = null;
          paint(pull.current, false);
        });
      }
    };

    const onEnd = () => {
      const reached = claimed.current && pull.current >= PULL_THRESHOLD;
      release();
      if (reached && !busy.current) void runRefresh();
      else paint(0, true);
    };

    node.addEventListener("touchstart", onStart, { passive: true });
    node.addEventListener("touchmove", onMove, { passive: false });
    node.addEventListener("touchend", onEnd, { passive: true });
    node.addEventListener("touchcancel", onEnd, { passive: true });

    return () => {
      node.removeEventListener("touchstart", onStart);
      node.removeEventListener("touchmove", onMove);
      node.removeEventListener("touchend", onEnd);
      node.removeEventListener("touchcancel", onEnd);
      // A gesture interrupted by unmount would otherwise leave a frame queued
      // against a detached node.
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [paint, runRefresh]);

  return (
    <div ref={root} className={cn("relative overscroll-y-contain", className)}>
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
