/**
 * Formatting helpers.
 *
 * Amounts arrive from the API as integer minor units. They are divided by 100
 * only here, at the display boundary — never in business logic, and never
 * stored back in that form.
 */

export function formatMoney(
  minorUnits: number,
  currency = "USD",
  options: { signed?: boolean; compact?: boolean } = {},
): string {
  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    notation: options.compact ? "compact" : "standard",
    maximumFractionDigits: options.compact ? 1 : 2,
  });

  const value = minorUnits / 100;
  const formatted = formatter.format(Math.abs(value));

  if (options.signed && minorUnits !== 0) {
    return `${minorUnits > 0 ? "+" : "−"}${formatted}`;
  }
  // Minus sign U+2212, not a hyphen: it aligns with digit width.
  return minorUnits < 0 ? `−${formatted}` : formatted;
}

export function formatDate(iso: string): string {
  // Date-only strings must not be shifted by the local timezone.
  const [year, month, day] = iso.split("T")[0].split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function formatDateLong(iso: string): string {
  const [year, month, day] = iso.split("T")[0].split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  depository: "Cash",
  credit: "Credit Card",
  loan: "Loan",
  investment: "Investment",
  other: "Other",
};

/** Liability balances are stored positive; net worth negates them. */
export function isLiability(type: string): boolean {
  return type === "credit" || type === "loan";
}
