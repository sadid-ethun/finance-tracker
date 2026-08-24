import { describe, expect, it } from "vitest";
import { MOBILE_TABS, MORE_ITEMS, isActive } from "@/lib/nav";

/**
 * The More panel's open state is derived as `openedAt === pathname`, so that
 * navigating anywhere closes it. This mirrors that derivation: a stored
 * boolean stayed true through a route change, leaving the panel covering the
 * page you had just navigated to.
 */
function isPanelOpen(openedAt: string | null, pathname: string): boolean {
  return openedAt === pathname;
}

describe("More panel open state", () => {
  it("stays open while the route does not change", () => {
    expect(isPanelOpen("/", "/")).toBe(true);
  });

  it("closes when a main tab navigates away", () => {
    const openedOnHome = "/";
    for (const tab of MOBILE_TABS) {
      if (tab.href === openedOnHome) continue;
      expect(isPanelOpen(openedOnHome, tab.href)).toBe(false);
    }
  });

  it("closes when one of its own items navigates away", () => {
    for (const item of MORE_ITEMS) {
      expect(isPanelOpen("/", item.href)).toBe(false);
    }
  });

  it("is closed when nothing opened it", () => {
    expect(isPanelOpen(null, "/")).toBe(false);
  });
});

describe("More tab indicator", () => {
  // The indicator follows `moreActive || moreOpen`: while the panel shows,
  // More is the selected tab even though nothing has been navigated to.
  const moreActive = (pathname: string) =>
    MORE_ITEMS.some((item) => isActive(pathname, item.href));

  it("marks More active on any route it owns", () => {
    for (const item of MORE_ITEMS) expect(moreActive(item.href)).toBe(true);
  });

  it("does not mark More active on a main tab route", () => {
    for (const tab of MOBILE_TABS) expect(moreActive(tab.href)).toBe(false);
  });

  it("never lights two tabs at once", () => {
    for (const path of [...MOBILE_TABS, ...MORE_ITEMS].map((i) => i.href)) {
      const lit =
        MOBILE_TABS.filter((t) => isActive(path, t.href)).length + (moreActive(path) ? 1 : 0);
      expect(lit).toBe(1);
    }
  });
});
