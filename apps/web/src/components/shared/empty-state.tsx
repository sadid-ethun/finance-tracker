import type { LucideIcon } from "lucide-react";

import { Card } from "@/components/shared/card";

/**
 * The standard empty state: soft icon, headline, one line of guidance, and a
 * call to action. Never a bare "No data" (PLAN.md section 21).
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <Card className="flex flex-col items-center px-6 py-14 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-accent">
        <Icon className="size-5 text-accent-foreground" strokeWidth={2} />
      </span>
      <h2 className="mt-4 text-base font-semibold">{title}</h2>
      <p className="mt-1 max-w-xs text-[14px] text-muted-foreground">
        {description}
      </p>
      {action ? <div className="mt-5">{action}</div> : null}
    </Card>
  );
}
