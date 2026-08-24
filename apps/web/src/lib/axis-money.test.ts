import { describe, expect, it } from "vitest";
import { formatAxisMoney, niceTicks, symmetricTicks } from "./chart-theme";

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


/**
 * Ticks must be round in whole units, not just in minor ones.
 *
 * Recharts picks ticks to fit the data, landing on values like 2,750 — which
 * a whole-thousand label reports as "$3k". Anything drawn between 2,750 and
 * 3,000, such as a $2,778 budget line, then appears *above* a gridline
 * claiming to be $3k. The maths is right and the label lies.
 */
describe("niceTicks", () => {
  it("produces values that survive the label rounding intact", () => {
    for (const max of [900000, 738267, 277800, 1226958, 4599]) {
      for (const tick of niceTicks(max)) {
        const major = tick / 100;
        // Every tick is a whole number of the unit its label shows.
        if (major >= 1000) expect(major % 1000).toBe(0);
        else expect(major % 1).toBe(0);
      }
    }
  });

  it("never rounds a tick to a value it is not", () => {
    // 2,500 renders as "$3k" — a step that is round in dollars and not in the
    // label, which is why 2.5 is excluded from the step choices.
    for (const max of [900000, 500000, 1000000]) {
      expect(niceTicks(max)).not.toContain(250000);
    }
  });

  it("covers the data rather than clipping it", () => {
    for (const max of [900000, 738267, 1226958]) {
      expect(niceTicks(max).at(-1)!).toBeGreaterThanOrEqual(max);
    }
  });

  it("gives a readable number of lines, not two", () => {
    // Picking the first step that fits collapsed a $9,000 range to $0 and $5k.
    expect(niceTicks(900000).length).toBeGreaterThanOrEqual(4);
  });

  it("handles an empty or negative range without producing NaN", () => {
    expect(niceTicks(0)).toEqual([0]);
    expect(niceTicks(-5)).toEqual([0]);
    expect(niceTicks(Number.NaN)).toEqual([0]);
  });
});

describe("symmetricTicks", () => {
  it("mirrors across zero, so both halves read against each other", () => {
    const ticks = symmetricTicks([{ income: 1_600_000, spending: 800_000 }]);
    const positive = ticks.filter((t) => t > 0);
    const negative = ticks.filter((t) => t < 0).map((t) => -t);

    expect(ticks).toContain(0);
    expect(negative.sort()).toEqual(positive.sort());
  });

  it("scales to the larger of income and spending", () => {
    const ticks = symmetricTicks([{ income: 100, spending: 900_000 }]);
    expect(ticks.at(-1)!).toBeGreaterThanOrEqual(900_000);
  });
});
