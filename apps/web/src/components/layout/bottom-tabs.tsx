"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { motion } from "motion/react";
import { MoreHorizontal } from "lucide-react";

import { MOBILE_TABS, MORE_ITEMS, isActive } from "@/lib/nav";
import { cn } from "@/lib/utils";

/**
 * Mobile navigation. The active pill animates between tabs via a shared
 * layoutId — the detail that makes the app feel native (PLAN.md section 21).
 */
export function BottomTabs() {
  const pathname = usePathname();
  /**
   * Open state, tied to the route it was opened on.
   *
   * Comparing a stored pathname against the current one was not enough: the
   * stored value was never cleared, so navigating away and back re-satisfied
   * the comparison and the panel reopened on arrival — from a tab tap that
   * had nothing to do with it.
   *
   * The route is carried alongside the flag and reset when it changes. That
   * reset happens during render, which React re-runs immediately without
   * committing the discarded pass; an effect would cascade a render, which
   * the compiler lint rejects.
   */
  const [panel, setPanel] = useState({ path: pathname, open: false });
  if (panel.path !== pathname) {
    setPanel({ path: pathname, open: false });
  }
  // Guarded: on the render that triggers the reset above, `panel` still holds
  // the previous route's state.
  const moreOpen = panel.open && panel.path === pathname;
  const setMoreOpen = (open: boolean) => setPanel({ path: pathname, open });

  const moreActive = MORE_ITEMS.some((item) => isActive(pathname, item.href));

  /**
   * Exactly one holder of the shared layout id, decided in one place.
   *
   * Two elements carrying the same layoutId at once leaves Framer to pick a
   * source between them, and the marker animates in from wherever that
   * happens to resolve — the "slides up from the bottom of the screen"
   * symptom. Opening the panel from any main tab did this: the tab kept its
   * indicator while More gained one.
   */
  const selected: string | null =
    moreOpen || moreActive
      ? "more"
      : (MOBILE_TABS.find((item) => isActive(pathname, item.href))?.href ?? null);

  return (
    <>
      {moreOpen ? (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px] lg:hidden"
          onClick={() => setMoreOpen(false)}
          aria-hidden
        />
      ) : null}

      {moreOpen ? (
        <div className={cn(
            "fixed inset-x-0 z-50 mx-3 overflow-hidden rounded-card border border-border lg:hidden",
            "bg-card",
            // Clears the bar rather than sitting flush on it. The offset is
            // the bar's height plus its trimmed inset plus the gap, derived
            // from the same expression so the two cannot drift.
            "bottom-[calc(3.5rem+0.5rem+max(0.25rem,calc(env(safe-area-inset-bottom)-0.75rem)))]",
          )}>
          {MORE_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMoreOpen(false)}
              className={cn(
                "flex items-center gap-3 px-5 py-4 text-[15px] font-medium",
                isActive(pathname, item.href) && "text-primary",
              )}
            >
              <item.icon className="size-[18px]" strokeWidth={2} />
              {item.label}
            </Link>
          ))}
        </div>
      ) : null}

      <nav
        aria-label="Primary"
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card/92 backdrop-blur lg:hidden",
          // The full safe-area inset is ~34px on a notched iPhone, which
          // leaves the labels floating well above the home indicator. Trim
          // 12px and keep a floor, so content still clears the indicator
          // without the bar looking bottom-heavy.
          "pb-[max(0.25rem,calc(env(safe-area-inset-bottom)-0.75rem))]",
        )}
      >
        <ul className="flex h-14 items-stretch">
          {MOBILE_TABS.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex h-full flex-col items-center justify-center gap-1",
                    active ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  {selected === item.href ? (
                    <motion.span
                      layoutId="tab-indicator"
                      className="absolute top-0 h-[3px] w-8 rounded-full bg-primary"
                      // Eased, not sprung. The reference is explicit: no
                      // bouncy springs, no overshoots (DESIGN_SYSTEM.md).
                      transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
                    />
                  ) : null}
                  <item.icon className="size-[22px]" strokeWidth={2} />
                  {/* Sans, not mono. The reference assigns nav to the UI
                      voice and reserves mono for labels and data readouts;
                      uppercase mono is also simply too wide here — five tabs
                      at 375px give each label 75px, and "TRANSACTIONS" needs
                      86px at the tracking this had. */}
                  <span className="text-[10px] font-medium">{item.label}</span>
                </Link>
              </li>
            );
          })}

          <li className="flex-1">
            <button
              type="button"
              onClick={() => setMoreOpen(!moreOpen)}
              aria-expanded={moreOpen}
              className={cn(
                "relative flex h-full w-full flex-col items-center justify-center gap-1",
                moreActive || moreOpen ? "text-primary" : "text-muted-foreground",
              )}
            >
              {/* Follows the open panel too, not just the route: while the
                  panel is showing, More is the selected tab even though
                  nothing has been navigated to yet. Same easing as the tabs —
                  a second copy of this with a different transition is what
                  made the indicator behave inconsistently. */}
              {selected === "more" ? (
                <motion.span
                  layoutId="tab-indicator"
                  className="absolute top-0 h-[3px] w-8 rounded-full bg-primary"
                  transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
                />
              ) : null}
              <MoreHorizontal className="size-[22px]" strokeWidth={2} />
              <span className="text-[10px] font-medium">More</span>
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}
