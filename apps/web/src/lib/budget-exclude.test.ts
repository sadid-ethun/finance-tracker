import { describe, expect, it } from "vitest";

/**
 * Excluding a category in the setup flow omits it from the saved budget. It is
 * not the same as a zero limit: an excluded category has no line and its
 * spending reports as unbudgeted, whereas a zero line is a limit of nothing
 * and reads as overspent the moment anything lands in it.
 */
type Row = { category_id: string; suggested: number };

function categoriesToSave(rows: Row[], excluded: Set<string>, edits: Record<string, string>) {
  return rows
    .filter((row) => !excluded.has(row.category_id))
    .map((row) => ({
      category_id: row.category_id,
      amount: Math.round(Number.parseFloat(edits[row.category_id] ?? (row.suggested / 100).toFixed(2)) * 100),
    }))
    .filter((c) => Number.isFinite(c.amount) && c.amount > 0);
}

const ROWS: Row[] = [
  { category_id: "groceries", suggested: 40000 },
  { category_id: "transport", suggested: 12000 },
  { category_id: "dining", suggested: 25000 },
];

describe("excluding categories", () => {
  it("omits an excluded category rather than sending it as zero", () => {
    const saved = categoriesToSave(ROWS, new Set(["transport"]), {});

    expect(saved.map((c) => c.category_id)).toEqual(["groceries", "dining"]);
    // Sending amount: 0 would round-trip as a deleted line anyway, but only
    // by accident — the intent is that it never appears.
    expect(saved.some((c) => c.amount === 0)).toBe(false);
  });

  it("keeps everything when nothing is excluded", () => {
    expect(categoriesToSave(ROWS, new Set(), {}).length).toBe(ROWS.length);
  });

  it("saves nothing when everything is excluded", () => {
    const all = new Set(ROWS.map((r) => r.category_id));
    expect(categoriesToSave(ROWS, all, {})).toEqual([]);
  });

  it("still drops a category the user typed to zero", () => {
    const saved = categoriesToSave(ROWS, new Set(), { dining: "0" });
    expect(saved.map((c) => c.category_id)).toEqual(["groceries", "transport"]);
  });

  it("ignores an unparseable amount rather than sending NaN", () => {
    const saved = categoriesToSave(ROWS, new Set(), { groceries: "abc" });
    expect(saved.map((c) => c.category_id)).toEqual(["transport", "dining"]);
  });
});
