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
        // Glass: 60% over an 8px blur, with saturation keeping the colour
        // that bleeds through from turning to grey mud.
        //
        // backdrop-blur-sm is 8px here, not the 4px the same class meant in
        // Tailwind v3 — the scale shifted in v4 and v3's `sm` is now `xs`.
        // Worth stating, because every blur class in this file reads one step
        // stronger than it used to.
        //
        // The blur is where the glassiness comes from, and it is down 8x from
        // the 64px this started at. That much blur is frosted, not glass:
        // whatever passed behind arrived as an unreadable smear, so the bar
        // read as a solid tinted slab. At 8px the content underneath is only
        // softened — you are looking through the bar at something you can
        // still identify, which is the whole effect.
        //
        // --tabbar-tint, not --card: see the token. Tinting with the card
        // colour made the bar disappear over a card, which is most of the
        // Accounts screen.
        //
        // 60% is the floor for the tint. Contrast against the page is not the
        // constraint — that improves as the bar gets more transparent, since
        // the page is darker than the card. The constraint is the white CTAs
        // that scroll under it: "Build a budget", the Add pill. Against white,
        // an inactive --on-glass icon measures 3.88:1 at 60% and 2.4:1 at
        // 45% — under the 3:1 WCAG 1.4.11 asks of a UI component.
        "bg-[color-mix(in_srgb,var(--tabbar-tint)_60%,transparent)]",
        "backdrop-blur-sm backdrop-saturate-[1.8]",
        // A hairline of light along the top edge is what separates glass
        // from a flat translucent panel. An explicit colour rather than
        // Tailwind's shadow-colour variable, which composes unreliably with
        // an arbitrary inset shadow.
        //
        // Carrying more of the separation now that the bar is darker than what
        // it floats over: the edge is what says "object", where the tone step
        // alone only says "shadow".
        //
        // Not a drop shadow: the flat-elevation rule is about casting
        // shadow onto the page, and this is a lit edge on the surface.
        "border border-white/18 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.18)]",
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
