import { describe, expect, it } from "vitest";
import { formatAxisMoney } from "./chart-theme";

/**
 * Axis labels are compact because a full "$2,414.82" on a y-axis at 375px
 * either truncates or eats a third of the plot. An axis marks the scale; the
 * exact figure belongs in the tooltip.
 */
describe("formatAxisMoney", () => {
  it("shows whole dollars below a thousand", () => {
    expect(formatAxisMoney(0)).toBe("$0");
    expect(formatAxisMoney(58640)).toBe("$586");
  });

  it("abbreviates thousands with one decimal", () => {
    expect(formatAxisMoney(244491)).toBe("$2.4k");
  });

  it("drops the decimal past ten thousand, where it stops being useful", () => {
    expect(formatAxisMoney(1370053)).toBe("$14k");
    expect(formatAxisMoney(3157112)).toBe("$32k");
  });

  it("keeps the sign outside the currency symbol", () => {
    // "$-2.4k" reads as a currency called "-2.4k".
    expect(formatAxisMoney(-241482)).toBe("-$2.4k");
  });

  it("never returns an empty label", () => {
    for (const v of [0, 1, -1, 99, 100_000_000]) {
      expect(formatAxisMoney(v).length).toBeGreaterThan(1);
    }
  });
});
