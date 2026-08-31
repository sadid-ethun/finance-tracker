/**
 * Shared Recharts theming.
 *
 * Recharts defaults are built for a white background: mid-grey axes and a
 * white tooltip, both of which are invisible or glaring on a near-black
 * canvas. Every value here reads a token, so the charts follow the theme
 * rather than carrying a second copy of it.
 */

/**
 * Category and series colours, in application order.
 *
 * Deep Iris from the reference palette is deliberately absent: it measures
 * 2.28:1 on the card surface and cannot carry a series (DESIGN_SYSTEM.md).
 */
export const CHART_SERIES = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
] as const;

/** Cycles rather than running out, so a long category list still renders. */
export function seriesColor(index: number): string {
  return CHART_SERIES[index % CHART_SERIES.length];
}

/**
 * Axis defaults. No axis line and no tick line — the reference is emphatic
 * about restraint, and on a dark canvas a drawn axis competes with the data
 * rather than framing it.
 */
/**
 * Axis tick labels for money.
 *
 * Compact, because a full "$2,414.82" on a y-axis at 375px either truncates or
 * eats a third of the plot. Whole units only — an axis marks the scale, and
 * the exact figure belongs in the tooltip.
 */
export function formatAxisMoney(minorUnits: number): string {
  const major = Math.abs(minorUnits) / 100;
  const sign = minorUnits < 0 ? "-" : "";
  // Whole units throughout. A decimal on an axis label implies a precision the
  // gridline does not have, and "$8k" reads faster than "$8.0k".
  if (major >= 1000) return `${sign}$${Math.round(major / 1000)}k`;
  return `${sign}$${Math.round(major)}`;
}

/**
 * Horizontal rules only.
 *
 * Reinstated deliberately: reading a bar's value by eye needs something to
 * read it against, and without gridlines the only way to get a number off
 * these charts was to press one. Vertical lines add nothing — the x axis is
 * already labelled by month.
 */
/**
 * Tick values at round money intervals.
 *
 * Recharts picks ticks to fit the data, which lands them on values like 2,750
 * — and a label rounded to whole thousands then reads "$3k". Anything drawn
 * between 2,750 and 3,000, such as a $2,778 budget line, appears *above* a
 * gridline claiming to be $3k. The maths is right and the label lies.
 *
 * Choosing round steps first means every label is exactly what it says.
 */
export function niceTicks(maxMinorUnits: number, target = 5): number[] {
  if (!Number.isFinite(maxMinorUnits) || maxMinorUnits <= 0) return [0];

  const maxMajor = maxMinorUnits / 100;

  // Steps chosen in whole units, not minor ones, and limited to 1/2/5 times a
  // power of ten. A 2.5 step is round in dollars and not in the label: 2,500
  // renders as "$3k" under whole-thousand rounding, which is the same lie.
  const candidates: number[] = [];
  for (let exp = 0; exp <= 9; exp++) {
    for (const m of [1, 2, 5]) candidates.push(m * 10 ** exp);
  }

  // Nearest to the requested number of lines, rather than the first that fits
  // — "first that fits" collapses a $9,000 range to two gridlines.
  let step = candidates[0];
  let best = Infinity;
  for (const candidate of candidates) {
    const count = Math.ceil(maxMajor / candidate) + 1;
    if (count < 2) continue;
    const distance = Math.abs(count - target);
    if (distance < best) {
      best = distance;
      step = candidate;
    }
  }

  const ticks: number[] = [];
  // Runs past the data so the top gridline is above the highest point rather
  // than clipping it.
  for (let value = 0; value < maxMajor + step; value += step) {
    ticks.push(Math.round(value * 100));
  }
  return ticks;
}

export const gridProps = {
  vertical: false as const,
  horizontal: true as const,
  stroke: "var(--border)",
  strokeDasharray: "3 3",
  // Without this the grid picks its own line positions and can miss one that
  // the axis has labelled — a labelled value with no rule to read it against.
  syncWithTicks: true as const,
};

export const axisProps = {
  axisLine: false as const,
  tickLine: false as const,
  tick: { fontSize: 11, fill: "var(--muted-foreground)" },
};



// ---------------------------------------------------------------- shadcn/ui

/**
 * Motion for chart entrance and updates.
 *
 * Recharts defaults to 1500ms, which is five times the slowest token in
 * DESIGN_SYSTEM.md and reads as a chart drawing itself rather than a value
 * appearing.
 *
 * Reduced motion turns animation off rather than shortening it: a chart caught
 * halfway through its own reveal reads as broken, not as restraint.
 */
export const CHART_MOTION_MS = 250;

export function chartAnimation(): { isAnimationActive: boolean; animationDuration: number } {
  // Off, everywhere. A chart that draws itself in delays the figure the reader
  // came for, and the delay is paid on every render — including the ones that
  // follow a refresh, where the data is already on screen and only redrawing.
  //
  // Kept as a function rather than deleted at each call site so this is one
  // decision in one place, and turning motion back on is one edit.
  return { isAnimationActive: false, animationDuration: 0 };
}

/**
 * One config for every chart, so a palette change is one edit rather than a
 * sweep through each view.
 *
 * `color` holds a `var(--token)` reference rather than a hex: ChartStyle emits
 * these into a scoped custom property, so the chart follows the theme instead
 * of carrying a frozen copy of it.
 *
 * Cyan Signal is the data accent and leads, per DESIGN.md's rule that it is
 * reserved for chart lines and data signals rather than general UI. The
 * category accents follow, for anything needing multiple distinguishable
 * series.
 */
export const chartConfig = {
  primary: { label: "Value", color: "var(--chart-1)" },
  series2: { label: "Series 2", color: "var(--chart-2)" },
  series3: { label: "Series 3", color: "var(--chart-3)" },
  series4: { label: "Series 4", color: "var(--chart-4)" },
  series5: { label: "Series 5", color: "var(--chart-5)" },
  series6: { label: "Series 6", color: "var(--chart-6)" },
  income: { label: "Income", color: "var(--positive)" },
  spending: { label: "Spending", color: "var(--negative)" },
  /** Prior period — deliberately muted so it cannot compete with the current one. */
  comparison: { label: "Previous", color: "var(--muted-foreground)" },
  /** A threshold, not a series. Rendered as a dashed reference line. */
  budget: { label: "Budget", color: "var(--chart-6)" },
} as const;

/**
 * A dashed reference line, for a threshold that should be readable without
 * competing with the data crossing it. The design system has no gridlines;
 * this is the one line that earns its place.
 */
export const referenceLineProps = {
  stroke: "var(--chart-6)",
  strokeDasharray: "4 4",
  strokeWidth: 1,
};

/**
 * Round ticks mirrored across zero, for the income-above / spending-below
 * charts. Generating each side independently would put a gridline at $8k and
 * none at -$8k, so the two halves would not be readable against each other.
 */
export function symmetricTicks(rows: { income: number; spending: number }[]): number[] {
  const peak = Math.max(0, ...rows.map((r) => Math.max(r.income, r.spending)));
  const positive = niceTicks(peak).filter((t) => t > 0);
  return [...positive.map((t) => -t).reverse(), 0, ...positive];
}
