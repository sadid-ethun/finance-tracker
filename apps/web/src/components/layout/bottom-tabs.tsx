"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";

import { MOBILE_TABS, isActive } from "@/lib/nav";
import { cn } from "@/lib/utils";

/**
 * Mobile navigation. The active pill animates between tabs via a shared
 * layoutId — the detail that makes the app feel native (PLAN.md section 21).
 *
 * Five tabs and no overflow, so this holds no state at all. The More panel it
 * replaced needed an open flag tied to the route it was opened on, and that
 * coupling produced three separate bugs: two elements claiming the same
 * layoutId, the panel reopening when you navigated back to its route, and it
 * failing to dismiss on a tab tap. None of them are reachable now.
 */
export function BottomTabs() {
  const pathname = usePathname();

  /**
   * Exactly one holder of the shared layout id.
   *
   * Two elements carrying the same layoutId at once leaves Framer to pick a
   * source between them, and the marker animates in from wherever that
   * resolves — the "slides up from the bottom of the screen" symptom. Deciding
   * it once here is what makes that unrepresentable.
   *
   * Null on the routes that are not tabs (Settings, and Home until it is
   * dissolved): no tab is active, so nothing is marked.
   */
  const selected =
    MOBILE_TABS.find((item) => isActive(pathname, item.href))?.href ?? null;

  return (
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
                    at 375px give each label about 68px, and the longest
                    ("Cash Flow") needs 50px at this size only in sans. */}
                <span className="relative text-[10px] font-medium">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
