import { describe, expect, it } from "vitest";

import { buildSeries, monthTotal } from "./spend-this-month";

/**
 * The headline figure and the chart line must come from one source.
 *
 * They did not: the figure read the budget's `total_spent` while the line read
 * /budgets/{month}/daily. Deleting a budget zeroes the former and leaves the
 * latter intact, so the card showed $0.00 above a chart drawing real spending.
 */
describe("monthTotal", () => {
  const day = (n: number) => `2026-08-${String(n).padStart(2, "0")}`;

  it("takes the last cumulative value, not the last element", () => {
    // The current month stops at today, so trailing days are null. Reading
    // series.at(-1) would report 0 for every month still in progress.
    const series = buildSeries(
      [
        { date: day(1), cumulative: 1_000 },
        { date: day(2), cumulative: 2_500 },
      ],
      [
        { date: day(1), cumulative: 900 },
        { date: day(2), cumulative: 1_800 },
        { date: day(3), cumulative: 2_000 },
      ],
    );

    expect(series).toHaveLength(3);
    expect(series[2].current).toBeNull();
    expect(monthTotal(series, "current")).toBe(2_500);
    expect(monthTotal(series, "previous")).toBe(2_000);
  });

  it("survives a deleted budget", () => {
    // The regression itself: no budget row, so total_spent would be 0, but the
    // daily series still has every transaction behind it.
    const series = buildSeries([{ date: day(1), cumulative: 4_204 }], []);

    expect(monthTotal(series, "current")).toBe(4_204);
    expect(monthTotal(series, "previous")).toBe(0);
  });

  it("reports zero for a month with no spending at all", () => {
    expect(monthTotal(buildSeries([], []), "current")).toBe(0);
  });

  it("does not mistake a flat stretch for the end of the data", () => {
    // Days with no spending repeat the previous cumulative rather than
    // dropping out, and a run of them at the end is real, not missing.
    const series = buildSeries(
      [
        { date: day(1), cumulative: 500 },
        { date: day(2), cumulative: 500 },
        { date: day(3), cumulative: 500 },
      ],
      [],
    );

    expect(monthTotal(series, "current")).toBe(500);
  });
});

describe("buildSeries", () => {
  it("aligns two months on day-of-month, not on date", () => {
    // A 28-day February against a 31-day January: day 1 must meet day 1, or
    // the two lines are not comparable.
    const series = buildSeries(
      [{ date: "2026-02-01", cumulative: 100 }],
      [{ date: "2026-01-01", cumulative: 200 }],
    );

    expect(series[0]).toEqual({ day: 1, current: 100, previous: 200 });
  });

  it("leaves gaps null rather than zero", () => {
    // Zero would draw the line back down to the axis and read as spending
    // reversed; null simply ends it.
    const series = buildSeries(
      [{ date: "2026-08-01", cumulative: 100 }],
      [
        { date: "2026-07-01", cumulative: 200 },
        { date: "2026-07-02", cumulative: 300 },
      ],
    );

    expect(series[1].current).toBeNull();
    expect(series[1].previous).toBe(300);
  });
});
