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

/** Horizontal rules only: vertical gridlines add noise and no information. */
export const gridProps = {
  vertical: false as const,
  stroke: "var(--border)",
};

/**
 * Tooltips are a floating surface, so they step up rather than down — the
 * pressed/raised token, not the card, or they vanish against the card they
 * are overlapping.
 */
export const tooltipStyle = {
  contentStyle: {
    background: "var(--secondary)",
    border: "1px solid var(--border)",
    borderRadius: "12px",
    fontSize: "13px",
    color: "var(--foreground)",
  },
  labelStyle: { color: "var(--muted-foreground)" },
  cursor: { fill: "var(--secondary)", opacity: 0.4 },
};
