"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { MOBILE_TABS, isActive } from "@/lib/nav";
import { cn } from "@/lib/utils";

/**
 * Mobile navigation. Icons only, in the shape of the apps this sits beside on
 * a home screen.
 *
 * No labels. Five destinations is few enough to learn by icon, and dropping
 * the text buys the icons enough size to be read at a glance instead of
 * squinted at — which is the trade every social app has already made.
 *
 * No animation on the indicator either. It is a plain element on the active
 * tab now, not a shared layout id sliding between them: the marker is where
 * your thumb already is, so animating it describes a journey the reader took
 * instantly and does not need narrated.
 *
 * Five tabs and no overflow, so this holds no state at all. The More panel it
 * replaced needed an open flag tied to the route it was opened on, and that
 * coupling produced three separate bugs: two elements claiming the same
 * layoutId, the panel reopening when you navigated back to its route, and it
 * failing to dismiss on a tab tap. None of them are reachable now.
 */
export function BottomTabs() {
  const pathname = usePathname();

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
                // Every tab is a fixed destination and there are only five, so
                // warm them all rather than waiting for the tap. These pages
                // are force-dynamic, which Next will not prefetch by default.
                prefetch
                aria-current={active ? "page" : undefined}
                // The label is gone from the surface, so it has to be here or
                // the tab is an unnamed glyph to a screen reader.
                aria-label={item.label}
                className={cn(
                  "relative flex h-full items-center justify-center",
                  active ? "text-foreground" : "text-on-glass",
                )}
              >
                {active ? (
                  // A capsule behind the tab rather than a rule above it. On
                  // glass a bright bar reads as a separate element sitting on
                  // the surface; a tint reads as part of it.
                  <span className="absolute inset-x-1 inset-y-1.5 rounded-full bg-white/10" />
                ) : null}
                {/* Above the capsule: it is absolutely positioned, so the
                    content needs its own stacking context to sit on top. */}
                <item.icon
                  className="relative size-[26px]"
                  strokeWidth={active ? 2.4 : 2}
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
