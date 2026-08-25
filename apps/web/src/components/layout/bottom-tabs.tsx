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
            "fixed inset-x-4 z-50 overflow-hidden rounded-card border border-border lg:hidden",
            "bg-card",
            // Reads the same geometry as the bar, so the two cannot drift.
            "bottom-[var(--tabbar-clearance)]",
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
          // inset-x-4 matches the page's px-4, so the bar lines up with the
          // cards above it rather than sitting a few pixels wider.
          "fixed inset-x-4 z-50 overflow-hidden rounded-full lg:hidden",
          "bottom-[var(--tabbar-inset)]",
          // Glass: 65%, with a heavy blur and saturation keeping the colour
          // that bleeds through from turning to grey mud. Transparency is
          // paid for in label contrast, and it is paid in --on-glass rather
          // than by putting the opacity back — see the token's note.
          "bg-card/65 backdrop-blur-3xl backdrop-saturate-[1.8]",
          // A hairline of light along the top edge is what separates glass
          // from a flat translucent panel. An explicit colour rather than
          // Tailwind's shadow-colour variable, which composes unreliably with
          // an arbitrary inset shadow.
          //
          // Not a drop shadow: the flat-elevation rule is about casting
          // shadow onto the page, and this is a lit edge on the surface.
          "border border-white/12 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.14)]",
        )}
      >
        <ul className="flex h-[var(--tabbar-height)] items-stretch">
          {MOBILE_TABS.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex h-full flex-col items-center justify-center gap-0.5",
                    selected === item.href ? "text-foreground" : "text-on-glass",
                  )}
                >
                  {selected === item.href ? (
                    <motion.span
                      layoutId="tab-indicator"
                      // A capsule behind the tab rather than a rule above it.
                      // On glass a bright bar reads as a separate element
                      // sitting on the surface; a tint reads as part of it.
                      className="absolute inset-x-1 inset-y-1.5 rounded-full bg-white/10"
                      // Eased, not sprung. The reference is explicit: no
                      // bouncy springs, no overshoots (DESIGN_SYSTEM.md).
                      transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
                    />
                  ) : null}
                  {/* Above the capsule: it is absolutely positioned, so the
                      content needs its own stacking context to sit on top. */}
                  <item.icon className="relative size-[22px]" strokeWidth={2} />
                  {/* Sans, not mono. The reference assigns nav to the UI
                      voice and reserves mono for labels and data readouts;
                      uppercase mono is also simply too wide here — five tabs
                      at 375px give each label 75px, and "TRANSACTIONS" needs
                      86px at the tracking this had. */}
                  <span className="relative text-[10px] font-medium">{item.label}</span>
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
                "relative flex h-full w-full flex-col items-center justify-center gap-0.5",
                moreActive || moreOpen ? "text-foreground" : "text-on-glass",
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
                  className="absolute inset-x-1 inset-y-1.5 rounded-full bg-white/10"
                  transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
                />
              ) : null}
              <MoreHorizontal className="relative size-[22px]" strokeWidth={2} />
              <span className="relative text-[10px] font-medium">More</span>
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}
