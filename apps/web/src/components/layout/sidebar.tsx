"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { NAV_ITEMS, isActive } from "@/lib/nav";
import { cn } from "@/lib/utils";

import { SignOutButton } from "./sign-out-button";

/** Desktop navigation: 240px fixed rail with every destination (PLAN.md 21). */
export function Sidebar({ userName }: { userName: string }) {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-border bg-card lg:flex">
      <div className="flex items-center gap-2.5 px-6 py-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icon-192.png"
          alt=""
          width={26}
          height={26}
          className="rounded-[7px]"
        />
        <span className="text-[15px] font-semibold tracking-[-0.01em]">
          Fintrac
        </span>
      </div>

      <nav aria-label="Primary" className="flex-1 px-3">
        <ul className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  // Every tab is a fixed destination and there are only five, so warm
                  // them all rather than waiting for the tap. These pages are
                  // force-dynamic, which Next will not prefetch on its own default.
                  prefetch
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-[14px] px-3 py-2.5 text-[15px] font-medium transition-colors",
                    active
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                  )}
                >
                  <item.icon className="size-[18px]" strokeWidth={2} />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-border p-3">
        <div className="px-3 py-2">
          <p className="truncate text-[13px] font-medium">{userName}</p>
        </div>
        <SignOutButton />
      </div>
    </aside>
  );
}
