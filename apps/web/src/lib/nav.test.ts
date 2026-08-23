import { describe, expect, it } from "vitest";
import { MOBILE_TABS, MOBILE_TAB_HREFS, MORE_ITEMS, NAV_ITEMS, isActive } from "./nav";

describe("mobile navigation", () => {
  it("resolves every tab href to a real destination", () => {
    // MOBILE_TABS maps with .find(...)!, so a typo'd href yields undefined at
    // runtime despite the non-null assertion, and the tab bar crashes on
    // render rather than failing to compile.
    expect(MOBILE_TABS).toHaveLength(MOBILE_TAB_HREFS.length);
    expect(MOBILE_TABS.every(Boolean)).toBe(true);
  });

  it("puts every destination in exactly one of the two lists", () => {
    const combined = [...MOBILE_TABS, ...MORE_ITEMS].map((i) => i.href).sort();
    const all = NAV_ITEMS.map((i) => i.href).sort();
    expect(combined).toEqual(all);
  });

  it("keeps the tab bar to five slots including More", () => {
    // Six destinations plus More is where a tab bar starts to feel cramped
    // (PLAN.md section 21).
    expect(MOBILE_TABS.length).toBeLessThanOrEqual(4);
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
});
