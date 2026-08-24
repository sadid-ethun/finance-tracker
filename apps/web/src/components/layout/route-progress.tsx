"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Top progress bar for route transitions.
 *
 * The App Router has no router events, and `useLinkStatus` reports only for
 * the Link it is rendered inside — useless for one bar covering every
 * navigation. So this listens for clicks on internal anchors and clears
 * itself when the route actually changes.
 *
 * Active state is derived from the pathname rather than reset in an effect:
 * while the pathname is still the one the click started on, the navigation is
 * in flight. Storing a boolean and clearing it on arrival would mean setState
 * inside an effect, which cascades a render.
 */
export function RouteProgress() {
  const pathname = usePathname();
  const [startedAt, setStartedAt] = useState<string | null>(null);

  const active = startedAt !== null && startedAt === pathname;

  useEffect(() => {
    function onClick(event: MouseEvent) {
      // Modified clicks open elsewhere and never navigate this document.
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const anchor = (event.target as Element | null)?.closest?.("a");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;

      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      // Same route means no navigation to wait for — the bar would never
      // clear, because the pathname it is watching never changes.
      if (url.pathname === window.location.pathname) return;

      setStartedAt(window.location.pathname);
    }

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  useEffect(() => {
    if (!active) return;
    // A navigation that is cancelled or fails never changes the pathname, so
    // without this the bar would sit there indefinitely.
    const timer = window.setTimeout(() => setStartedAt(null), 8000);
    return () => window.clearTimeout(timer);
  }, [active]);

  if (!active) return null;

  return (
    <div
      role="progressbar"
      aria-label="Loading page"
      aria-busy="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[2px] overflow-hidden"
    >
      {/* Indeterminate: the router gives no completion fraction, so a bar
          that crept toward 100% would be inventing one. This reads as
          activity without claiming progress. */}
      <div className="animate-route-progress h-full w-2/5 bg-primary" />
    </div>
  );
}
