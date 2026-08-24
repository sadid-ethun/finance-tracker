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
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  return { isAnimationActive: !reduced, animationDuration: CHART_MOTION_MS };
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
