import { describe, expect, it } from "vitest";
import {
  MOBILE_TABS,
  MOBILE_TAB_HREFS,
  NAV_ITEMS,
  NON_TAB_HREFS,
  isActive,
} from "./nav";

describe("mobile navigation", () => {
  it("resolves every tab href to a real destination", () => {
    // MOBILE_TABS maps with .find(...)!, so a typo'd href yields undefined at
    // runtime despite the non-null assertion, and the tab bar crashes on
    // render rather than failing to compile.
    expect(MOBILE_TABS).toHaveLength(MOBILE_TAB_HREFS.length);
    expect(MOBILE_TABS.every(Boolean)).toBe(true);
  });

  it("leaves no destination unreachable on mobile", () => {
    // There is no More panel to catch omissions any more: a destination in
    // NAV_ITEMS that is neither a tab nor explicitly a non-tab simply has no
    // way to be opened on a phone.
    const covered = [...MOBILE_TAB_HREFS, ...NON_TAB_HREFS].sort();
    const all = NAV_ITEMS.map((i) => i.href).sort();
    expect(covered).toEqual(all);
  });

  it("does not list a destination as both a tab and a non-tab", () => {
    const overlap = MOBILE_TAB_HREFS.filter((href) => NON_TAB_HREFS.includes(href));
    expect(overlap).toEqual([]);
  });

  it("keeps the tab bar to five slots", () => {
    // Six is where a tab bar starts to feel cramped (PLAN.md section 21), and
    // five is now the whole set rather than four plus an overflow button.
    expect(MOBILE_TABS).toHaveLength(5);
  });

  it("orders the tabs money-out first, then what you own", () => {
    // Accounts precedes Portfolio because net worth is the total and holdings
    // are one component of it (IA_PLAN.md).
    expect(MOBILE_TAB_HREFS).toEqual([
      "/transactions",
      "/budgets",
      "/cash-flow",
      "/accounts",
      "/investments",
    ]);
  });
});

describe("isActive", () => {
  it("matches Home only exactly", () => {
    expect(isActive("/", "/")).toBe(true);
    expect(isActive("/transactions", "/")).toBe(false);
  });

  it("keeps a parent tab active on nested routes", () => {
    expect(isActive("/accounts/abc123", "/accounts")).toBe(true);
  });

  it("does not match a route that merely shares a prefix", () => {
    expect(isActive("/investments-archive", "/investments")).toBe(false);
  });

  it("marks no tab active on the routes that are not tabs", () => {
    // Settings and Home are reachable but have no tab, so the shared layout
    // indicator has no holder there rather than an arbitrary one.
    for (const pathname of NON_TAB_HREFS) {
      const selected = MOBILE_TABS.find((item) => isActive(pathname, item.href));
      expect(selected).toBeUndefined();
    }
  });
});
