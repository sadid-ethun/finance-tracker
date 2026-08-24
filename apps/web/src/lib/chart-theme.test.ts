import { describe, expect, it } from "vitest";
import { CHART_SERIES, seriesColor } from "./chart-theme";

describe("seriesColor", () => {
  it("returns a distinct colour per series until the palette is exhausted", () => {
    const used = CHART_SERIES.map((_, i) => seriesColor(i));
    expect(new Set(used).size).toBe(CHART_SERIES.length);
  });

  it("cycles rather than running out", () => {
    // A category list is user-supplied and can be longer than the palette.
    // Returning undefined here would render an unstyled slice.
    expect(seriesColor(CHART_SERIES.length)).toBe(seriesColor(0));
    expect(seriesColor(CHART_SERIES.length * 3 + 2)).toBe(seriesColor(2));
  });

  it("only ever emits token references, never literal colours", () => {
    // A literal would survive a theme change and quietly become the one
    // element still wearing the old palette.
    for (const colour of CHART_SERIES) expect(colour).toMatch(/^var\(--chart-\d\)$/);
  });
});
