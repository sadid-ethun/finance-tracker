import { describe, expect, it } from "vitest";
import { cashFlowWindow } from "@/hooks/use-finance";

/**
 * The window has to match the server's, which starts at the first of the month
 * `months - 1` ago and ends on the last day of the current month. If the two
 * drift, a category row saying "14 transactions" opens a list containing some
 * other number of them, and the page quietly stops being trustworthy.
 */
describe("cashFlowWindow", () => {
  it("starts on the first of a month and ends on a month end", () => {
    const { from, to } = cashFlowWindow(6);

    expect(from).toMatch(/^\d{4}-\d{2}-01$/);
    // The end is the last day of the current month, so the next day is the 1st.
    const next = new Date(`${to}T00:00:00`);
    next.setDate(next.getDate() + 1);
    expect(next.getDate()).toBe(1);
  });

  it("spans exactly the requested number of months", () => {
    for (const months of [6, 12, 24]) {
      const { from, to } = cashFlowWindow(months);
      const start = new Date(`${from}T00:00:00`);
      const end = new Date(`${to}T00:00:00`);
      const span =
        (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
      expect(span).toBe(months);
    }
  });

  it("ends in the current month", () => {
    const now = new Date();
    const { to } = cashFlowWindow(12);
    const end = new Date(`${to}T00:00:00`);

    expect(end.getFullYear()).toBe(now.getFullYear());
    expect(end.getMonth()).toBe(now.getMonth());
  });
});
