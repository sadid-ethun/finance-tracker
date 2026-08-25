import Link from "next/link";
import { Settings } from "lucide-react";

import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  action,
  settingsLink = true,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  /**
   * Set false on the settings screen itself, where the gear would link to the
   * page you are already on. Everywhere else it stays on: the gear is rendered
   * here rather than passed in per page so its position cannot drift between
   * screens, which is the whole reason it can replace a tab.
   */
  settingsLink?: boolean;
}) {
  return (
    <header className="mb-6 flex items-start justify-between gap-4">
      <div>
        {/* The display voice. Scaled to app sizes rather than the reference's
          80-96px marketing hero, and tracked in rather than lightened —
          the substitute serif ships at weight 400 where the reference
          specifies 300. */}
      <h1 className="font-serif text-[26px] leading-none font-normal tracking-[-0.01em] lg:text-[32px]">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 text-[15px] text-muted-foreground">{description}</p>
        ) : null}
      </div>

      <div className="flex items-center gap-1">
        {action}
        {settingsLink ? (
          <Link
            href="/settings"
            aria-label="Settings"
            className={cn(
              // 44px target. The negative margins let the box overhang the
              // page padding so the icon still aligns optically with the
              // content edge rather than sitting inset by its own padding.
              "-mt-2 -mr-3 flex size-11 items-center justify-center rounded-full",
              "text-muted-foreground transition-colors hover:text-foreground",
              // Desktop has Settings in the sidebar; a second entry point in
              // the header would be redundant there.
              "lg:hidden",
            )}
          >
            <Settings className="size-5" strokeWidth={2} />
          </Link>
        ) : null}
      </div>
    </header>
  );
}
