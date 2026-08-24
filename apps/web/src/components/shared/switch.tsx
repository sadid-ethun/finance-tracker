"use client";

import { cn } from "@/lib/utils";

/**
 * A two-state switch.
 *
 * A real checkbox underneath rather than a styled div: it arrives with the
 * keyboard behaviour, the accessible name, and the checked state already
 * correct, which a div with role="switch" has to reimplement and usually
 * reimplements incompletely.
 */
export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <label className="relative inline-flex shrink-0 cursor-pointer items-center">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="peer sr-only"
        aria-label={label}
      />
      <span
        aria-hidden
        className={cn(
          "h-[22px] w-[38px] rounded-full transition-colors",
          // Focus lands on the hidden input, so the ring has to be drawn on
          // the visible track or keyboard users see nothing.
          "peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring",
          checked ? "bg-primary" : "bg-secondary",
        )}
      />
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute left-[3px] size-4 rounded-full transition-transform",
          checked ? "translate-x-[16px] bg-primary-foreground" : "bg-muted-foreground",
        )}
      />
    </label>
  );
}
