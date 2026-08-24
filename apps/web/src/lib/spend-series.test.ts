import { describe, expect, it } from "vitest";

/**
 * Mirrors buildSeries in spend-this-month.tsx: two cumulative month series
 * aligned on day-of-month so they can be read against each other.
 */
type Point = { date: string; cumulative: number };

function buildSeries(current: Point[], previous: Point[]) {
  const dayOf = (iso: string) => Number(iso.slice(8, 10));
  const currentBy = new Map(current.map((p) => [dayOf(p.date), p.cumulative]));
  const previousBy = new Map(previous.map((p) => [dayOf(p.date), p.cumulative]));
  const lastDay = Math.max(0, ...currentBy.keys(), ...previousBy.keys());
  return Array.from({ length: lastDay }, (_, i) => ({
    day: i + 1,
    current: currentBy.get(i + 1) ?? null,
    previous: previousBy.get(i + 1) ?? null,
  }));
}

const day = (m: string, d: number, cumulative: number): Point => ({
  date: `2026-${m}-${String(d).padStart(2, "0")}`,
  cumulative,
});

describe("aligning two months", () => {
  it("lines months of different lengths up on day-of-month", () => {
    // A 28-day February against a 31-day January. Joining on date would put
    // them at separate x positions and the lines would never be comparable.
    const feb = [day("02", 1, 100), day("02", 28, 2800)];
    const jan = [day("01", 1, 50), day("01", 31, 3100)];
    const series = buildSeries(feb, jan);

    expect(series[0]).toEqual({ day: 1, current: 100, previous: 50 });
    expect(series.at(-1)?.day).toBe(31);
  });

  it("ends the current month with null rather than zero", () => {
    // The current month stops at today. Zero would draw the line back down to
    // the axis and read as spending reversed; null simply ends it.
    const partial = [day("03", 1, 100), day("03", 2, 250)];
    const full = [day("02", 1, 80), day("02", 3, 400)];
    const series = buildSeries(partial, full);

    expect(series[2].current).toBeNull();
    expect(series[2].previous).toBe(400);
  });

  it("spans the longer of the two months", () => {
    expect(buildSeries([day("02", 28, 1)], [day("01", 31, 1)]).length).toBe(31);
    expect(buildSeries([day("01", 31, 1)], [day("02", 28, 1)]).length).toBe(31);
  });

  it("returns nothing when neither month has data", () => {
    // Math.max of an empty spread is -Infinity; the zero seed guards it.
    expect(buildSeries([], [])).toEqual([]);
  });
});
