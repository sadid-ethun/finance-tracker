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

  it("abbreviates thousands without decimals", () => {
    // A decimal implies a precision the gridline does not have, and "$8k"
    // reads faster than "$8.0k".
    expect(formatAxisMoney(244491)).toBe("$2k");
    expect(formatAxisMoney(800000)).toBe("$8k");
    expect(formatAxisMoney(1370053)).toBe("$14k");
    expect(formatAxisMoney(3157112)).toBe("$32k");
  });

  it("keeps the sign outside the currency symbol", () => {
    // "$-2k" reads as a currency called "-2k".
    expect(formatAxisMoney(-241482)).toBe("-$2k");
  });

  it("never returns an empty label", () => {
    for (const v of [0, 1, -1, 99, 100_000_000]) {
      expect(formatAxisMoney(v).length).toBeGreaterThan(1);
    }
  });
});
