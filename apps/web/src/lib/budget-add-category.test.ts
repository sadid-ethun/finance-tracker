import { describe, expect, it } from "vitest";

/**
 * Which categories the add-a-category picker offers.
 *
 * A budget is a spending limit. Income has nothing to limit, and transfers are
 * excluded from spending totals entirely, so a line on either can never be met
 * or exceeded — it would sit at 0% forever.
 */
type Category = { id: string; name: string; kind: string };

function availableCategories(all: Category[], budgetedIds: Set<string>) {
  return all.filter((c) => c.kind === "expense" && !budgetedIds.has(c.id));
}

const ALL: Category[] = [
  { id: "groceries", name: "Groceries", kind: "expense" },
  { id: "salary", name: "Salary", kind: "income" },
  { id: "xfer", name: "Transfer", kind: "transfer" },
  { id: "dining", name: "Dining", kind: "expense" },
];

describe("add-category options", () => {
  it("offers only expense categories", () => {
    const ids = availableCategories(ALL, new Set()).map((c) => c.id);
    expect(ids).toEqual(["groceries", "dining"]);
  });

  it("hides categories already in the budget", () => {
    const ids = availableCategories(ALL, new Set(["groceries"])).map((c) => c.id);
    expect(ids).toEqual(["dining"]);
  });

  it("offers nothing once every expense category is budgeted", () => {
    // The control hides itself in this case rather than opening an empty
    // picker.
    expect(availableCategories(ALL, new Set(["groceries", "dining"]))).toEqual([]);
  });
});

/**
 * A category removed from the budget must come back as an option, or removing
 * a line is one-way and the only route back is deleting the whole budget.
 */
describe("removing then re-adding", () => {
  it("returns a removed category to the picker", () => {
    const budgeted = new Set(["groceries", "dining"]);
    expect(availableCategories(ALL, budgeted)).toEqual([]);

    budgeted.delete("dining");
    expect(availableCategories(ALL, budgeted).map((c) => c.id)).toEqual(["dining"]);
  });
});
