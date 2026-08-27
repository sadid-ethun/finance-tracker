"use client";

import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { PULL_THRESHOLD, pullFor, shouldRefresh } from "@/lib/pull-to-refresh";
import { cn } from "@/lib/utils";

/** Finger travel before the gesture is claimed as a pull rather than a tap. */
const CLAIM_AT = 4;

/**
 * Scroll offset still counted as "the top".
 *
 * iOS reports sub-pixel offsets, and negative ones while rubber-banding.
 * Testing `scrollY > 0` treated both as "the reader has scrolled".
 */
const TOP_TOLERANCE = 1;

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
  // Temporary, with the readout below. Read once so toggling it needs a reload
  // rather than re-running on every render.
  const [debugging] = useState(
    () =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).has("ptrdebug"),
  );

  const root = useRef<HTMLDivElement | null>(null);
  const debugBox = useRef<HTMLPreElement | null>(null);
  const trace = useRef({
    start: "-",
    moves: 0,
    maxDelta: 0,
    claimed: false,
    cancelable: "-",
    pull: 0,
    vel: 0,
    end: "-",
  });
  const surface = useRef<HTMLDivElement | null>(null);
  const indicator = useRef<HTMLDivElement | null>(null);

  const startY = useRef<number | null>(null);
  const claimed = useRef(false);
  const pull = useRef(0);
  // Last sample, for the release velocity. A flick ends before it has
  // travelled far, so distance alone cannot recognise one.
  const lastY = useRef(0);
  const lastAt = useRef(0);
  const velocity = useRef(0);
  const frame = useRef<number | null>(null);
  // The native listeners are bound once; state read inside them has to come
  // from a ref or the closure would keep seeing the first render's value.
  const busy = useRef(false);

  /**
   * Temporary: a readout of the gesture, on screen, enabled with ?ptrdebug=1.
   *
   * Three fixes aimed at this bug from reasoning alone have missed, so this
   * reports what actually happens on the device rather than what should. Like
   * paint(), it writes to the DOM directly — going through React state would
   * change the timing of the thing being measured.
   *
   * Delete once the gesture is confirmed working.
   */
  const report = useCallback(() => {
    const box = debugBox.current;
    if (!box) return;
    const t = trace.current;
    box.textContent = [
      `start     ${t.start}`,
      `moves     ${t.moves}`,
      `maxDelta  ${t.maxDelta.toFixed(1)}`,
      `claimed   ${t.claimed}`,
      `cancelable ${t.cancelable}`,
      `pull      ${t.pull.toFixed(1)} / ${PULL_THRESHOLD}`,
      `velocity  ${t.vel.toFixed(3)}`,
      `end       ${t.end}`,
    ].join("\n");
  }, []);

  /**
   * Writes the current pull to the DOM. Composited; never touches React.
   *
   * Any frame already queued is dropped first. Without that, a scheduled
   * repaint outlives the gesture that scheduled it and lands afterwards,
   * reading `pull.current` at execution time rather than the value it was
   * queued with — which by then is 0, painted with no transition.
   *
   * That is what made a fast swipe show nothing at all. Every touchmove in a
   * quick flick arrives inside a single frame, so the one queued repaint ran
   * after touchend had already reset the distance and started the refresh:
   * step for step, pull to 60, queue a frame, release to 0, paint the resting
   * position, then the stale frame wipes it. A slow drag hid the bug, because
   * frames fell between the moves and each one still read a live value.
   */
  const paint = useCallback((distance: number, animate: boolean) => {
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current);
      frame.current = null;
    }

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
      const target = event.target;
      trace.current = {
        start: `y=${(event.touches[0]?.clientY ?? -1).toFixed(0)} scrollY=${window.scrollY.toFixed(2)}`,
        moves: 0,
        maxDelta: 0,
        claimed: false,
        cancelable: "-",
        pull: 0,
        vel: 0,
        end: "-",
      };
      if (busy.current || !(target instanceof Node) || !node.contains(target)) {
        trace.current.start += busy.current ? " REJECT:busy" : " REJECT:outside";
        report();
        release();
        return;
      }
      report();
      // Deliberately not gated on scroll position here.
      //
      // It used to be, and that is what broke fast swipes: if scrollY was not
      // exactly 0 at the instant of touchstart — still settling from momentum,
      // or mid rubber-band, where iOS reports fractional and negative values —
      // startY was never recorded, and every touchmove after it returned at
      // the null check. The gesture was dead before it began. A slow swipe let
      // the position settle first, which is why only fast ones failed.
      //
      // Where the page is is a question for touchmove, when a direction is
      // known and the answer is no longer in flux.
      startY.current = event.touches[0]?.clientY ?? null;
      claimed.current = false;
      lastY.current = startY.current ?? 0;
      lastAt.current = event.timeStamp;
      velocity.current = 0;
    };

    const onMove = (event: TouchEvent) => {
      trace.current.moves += 1;
      if (startY.current === null || busy.current) {
        trace.current.end = startY.current === null ? "DEAD:no startY" : "DEAD:busy";
        report();
        return;
      }
      const delta = (event.touches[0]?.clientY ?? 0) - startY.current;
      trace.current.maxDelta = Math.max(trace.current.maxDelta, delta);
      trace.current.cancelable = String(event.cancelable);

      if (delta <= 0) {
        // Upward: hand it back to the scroller rather than fighting it.
        if (claimed.current) paint(0, true);
        release();
        return;
      }

      // Now: at the top, moving down. A fraction of a pixel counts as the top
      // — iOS reports sub-pixel offsets and, while rubber-banding, negative
      // ones, and neither means the reader has scrolled anywhere.
      //
      // Once claimed, the check is not repeated: the transform moves the page
      // under the finger, and re-reading scroll position mid-gesture would let
      // it cancel itself halfway through.
      if (!claimed.current) {
        if (window.scrollY > TOP_TOLERANCE) {
          // A real scroll. Leave it alone for the rest of this gesture.
          trace.current.end = `REJECT:scrollY=${window.scrollY.toFixed(2)}`;
          report();
          startY.current = null;
          return;
        }
        if (delta <= CLAIM_AT) return;
        claimed.current = true;
        trace.current.claimed = true;
        // Re-base so the pull starts from where it was claimed, not from
        // touchstart — otherwise the content jumps by CLAIM_AT on claim.
        startY.current = (event.touches[0]?.clientY ?? 0) - CLAIM_AT;
      }

      if (event.cancelable) event.preventDefault();

      const y = event.touches[0]?.clientY ?? lastY.current;
      const elapsed = event.timeStamp - lastAt.current;
      // Guard the divide: coalesced moves can share a timestamp.
      if (elapsed > 0) velocity.current = (y - lastY.current) / elapsed;
      lastY.current = y;
      lastAt.current = event.timeStamp;

      pull.current = pullFor(delta);
      trace.current.pull = pull.current;
      trace.current.vel = velocity.current;
      report();
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
      const reached =
        claimed.current && shouldRefresh(pull.current, velocity.current);
      trace.current.end = reached ? "REFRESH" : `no (claimed=${claimed.current})`;
      report();
      release();
      if (reached && !busy.current) void runRefresh();
      else paint(0, true);
    };

    // On window, not on `node`.
    //
    // Listening on the wrapper means every ancestor and descendant between the
    // touch target and it has a chance to not deliver — a stopPropagation, a
    // portal, a subtree that never bubbles. window is the one place the events
    // are guaranteed to arrive, which removes delivery as a variable. It is
    // also what pulltorefresh.js does. Containment is checked in onStart
    // instead, so touching outside this subtree still does nothing.
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onEnd, { passive: true });

    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
      // A gesture interrupted by unmount would otherwise leave a frame queued
      // against a detached node.
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [paint, runRefresh, report]);

  // overscroll-behavior lives on html/body in globals.css, not here: the
  // document is the scroller, so containing it on this div did nothing.
  return (
    <div ref={root} className={cn("relative", className)}>
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

      {/* Temporary. Delete with the trace/report machinery above once the
          gesture is confirmed working on device. */}
      {debugging ? (
        <pre
          ref={debugBox}
          className="pointer-events-none fixed top-2 right-2 z-[100] rounded-md bg-black/85 px-2 py-1.5 font-mono text-[10px] leading-tight text-lime-300"
        >
          waiting for a swipe…
        </pre>
      ) : null}

      <div ref={surface} style={{ willChange: "transform" }} className={className}>
        {children}
      </div>
    </div>
  );
}
