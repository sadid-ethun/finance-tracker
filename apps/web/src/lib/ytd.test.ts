import { describe, expect, it } from "vitest";

/** Mirrors monthsFor in cash-flow-view.tsx. */
type RangeKey = "6m" | "12m" | "ytd" | "24m";

function monthsFor(range: RangeKey, now = new Date()): number {
  switch (range) {
    case "6m":
      return 6;
    case "12m":
      return 12;
    case "24m":
      return 24;
    case "ytd":
      return now.getMonth() + 1;
  }
}

describe("YTD as a month count", () => {
  it("is 1 in January — the current month only", () => {
    expect(monthsFor("ytd", new Date(2026, 0, 15))).toBe(1);
  });

  it("counts January through the current month inclusive", () => {
    expect(monthsFor("ytd", new Date(2026, 7, 23))).toBe(8); // August
    expect(monthsFor("ytd", new Date(2026, 11, 31))).toBe(12);
  });

  it("never reaches into the previous year", () => {
    for (let m = 0; m < 12; m++) {
      expect(monthsFor("ytd", new Date(2026, m, 1))).toBeLessThanOrEqual(m + 1);
    }
  });

  it("can collide with a fixed option, which is why selection is keyed", () => {
    // In June, YTD is six months. Keying the selected state on the number
    // would light both buttons at once.
    expect(monthsFor("ytd", new Date(2026, 5, 10))).toBe(monthsFor("6m"));
  });
});
