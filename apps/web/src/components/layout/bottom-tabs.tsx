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
  const [moreOpen, setMoreOpen] = useState(false);

  const moreActive = MORE_ITEMS.some((item) => isActive(pathname, item.href));

  return (
    <>
      {moreOpen ? (
        <div
          className="fixed inset-0 z-40 bg-black/20 lg:hidden"
          onClick={() => setMoreOpen(false)}
          aria-hidden
        />
      ) : null}

      {moreOpen ? (
        <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+64px)] z-50 mx-3 overflow-hidden rounded-card border border-border bg-card shadow-lg lg:hidden">
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
        className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card/92 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        <ul className="flex h-16 items-stretch">
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
                  {active ? (
                    <motion.span
                      layoutId="tab-indicator"
                      className="absolute top-0 h-[3px] w-8 rounded-full bg-primary"
                      // Eased, not sprung. The reference is explicit: no
                      // bouncy springs, no overshoots (DESIGN_SYSTEM.md).
                      transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
                    />
                  ) : null}
                  <item.icon className="size-[22px]" strokeWidth={2} />
                  {/* Uppercase tracked mono: the tab bar is instrumentation,
                      and this is the type system's anchor voice. */}
                  <span className="font-mono text-[10px] tracking-[0.12em] uppercase">
                    {item.label}
                  </span>
                </Link>
              </li>
            );
          })}

          <li className="flex-1">
            <button
              type="button"
              onClick={() => setMoreOpen((open) => !open)}
              aria-expanded={moreOpen}
              className={cn(
                "relative flex h-full w-full flex-col items-center justify-center gap-1",
                moreActive || moreOpen ? "text-primary" : "text-muted-foreground",
              )}
            >
              {moreActive ? (
                <motion.span
                  layoutId="tab-indicator"
                  className="absolute top-0 h-[3px] w-8 rounded-full bg-primary"
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                />
              ) : null}
              <MoreHorizontal className="size-[22px]" strokeWidth={2} />
              <span className="text-[11px] font-medium">More</span>
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}
