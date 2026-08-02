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
  const tone = !colored
    ? undefined
    : minorUnits > 0
      ? "var(--positive)"
      : minorUnits < 0
        ? "var(--negative)"
        : undefined;

  return (
    <span className={cn("tabular", className)} style={tone ? { color: tone } : undefined}>
      {formatMoney(minorUnits, currency, { signed })}
    </span>
  );
}
