"use client";

import { useDecoy } from "@/lib/decoy";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Tabular figures so digits never jitter as values update (PLAN.md 21).
 * Colour is opt-in: a plain balance should not be green just for being positive.
 */
export function Money({
  minorUnits,
  currency = "USD",
  colored = false,
  signed = false,
  className,
}: {
  minorUnits: number;
  currency?: string;
  colored?: boolean;
  signed?: boolean;
  className?: string;
}) {
  // Identity everywhere except inside a DecoyScope with the toggle on.
  const { amount } = useDecoy();
  const value = amount(minorUnits);

  const tone = !colored
    ? undefined
    : value > 0
      ? "var(--positive)"
      : value < 0
        ? "var(--negative)"
        : undefined;

  return (
    <span className={cn("tabular", className)} style={tone ? { color: tone } : undefined}>
      {formatMoney(value, currency, { signed })}
    </span>
  );
}
