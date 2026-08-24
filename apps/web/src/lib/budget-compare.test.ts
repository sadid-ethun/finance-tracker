import { describe, expect, it } from "vitest";

/**
 * The comparison card puts both months and the budget on one scale. Separate
 * scales would make the two bars incomparable while looking like a
 * comparison — the failure mode is that it still renders and simply means
 * nothing.
 */
const scaleFor = (spent: number, compared: number, budgeted: number) =>
  Math.max(spent, compared, budgeted, 1);

const widthPct = (value: number, scale: number) => Math.min((value / scale) * 100, 100);

describe("shared comparison scale", () => {
  it("is driven by the largest of the three values", () => {
    expect(scaleFor(400, 900, 600)).toBe(900);
    expect(scaleFor(400, 100, 1200)).toBe(1200);
  });

  it("keeps the larger month visibly wider than the smaller", () => {
    const scale = scaleFor(300, 900, 600);
    expect(widthPct(300, scale)).toBeLessThan(widthPct(900, scale));
  });

  it("never divides by zero on an empty month", () => {
    // A month with no budget and no spend would otherwise produce NaN and
    // render a bar with width="NaN%".
    const scale = scaleFor(0, 0, 0);
    expect(scale).toBe(1);
    expect(Number.isFinite(widthPct(0, scale))).toBe(true);
  });

  it("clamps rather than overflowing its track", () => {
    expect(widthPct(5000, 1000)).toBe(100);
  });
});
