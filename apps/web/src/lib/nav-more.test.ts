import { describe, expect, it } from "vitest";
import { MOBILE_TABS, MORE_ITEMS, isActive } from "@/lib/nav";

/**
 * Mirrors the panel's state machine: a flag carried alongside the route it
 * belongs to, reset whenever the route changes.
 *
 * The earlier version compared a stored pathname against the current one and
 * never cleared it, so navigating away and back re-satisfied the comparison
 * and the panel reopened on arrival.
 */
class Panel {
  private state: { path: string; open: boolean };

  constructor(path: string) {
    this.state = { path, open: false };
  }

  /** The render-phase reset. */
  private sync(path: string) {
    if (this.state.path !== path) this.state = { path, open: false };
  }

  isOpen(path: string): boolean {
    this.sync(path);
    return this.state.open && this.state.path === path;
  }

  tapMore(path: string): boolean {
    const now = this.isOpen(path);
    this.state = { path, open: !now };
    return this.state.open;
  }
}

describe("More panel open state", () => {
  it("opens on tap and stays open while the route does not change", () => {
    const panel = new Panel("/");
    expect(panel.tapMore("/")).toBe(true);
    expect(panel.isOpen("/")).toBe(true);
  });

  it("toggles shut on a second tap", () => {
    const panel = new Panel("/");
    panel.tapMore("/");
    expect(panel.tapMore("/")).toBe(false);
  });

  it("closes when a main tab navigates away", () => {
    for (const tab of MOBILE_TABS) {
      if (tab.href === "/") continue;
      const panel = new Panel("/");
      panel.tapMore("/");
      expect(panel.isOpen(tab.href)).toBe(false);
    }
  });

  it("closes when one of its own items navigates away", () => {
    for (const item of MORE_ITEMS) {
      const panel = new Panel("/");
      panel.tapMore("/");
      expect(panel.isOpen(item.href)).toBe(false);
    }
  });

  it("does not reopen on returning to the route it was opened from", () => {
    // The regression: open on Home, tab away, tab back — and the panel was
    // waiting there, from a tap that had nothing to do with it.
    const panel = new Panel("/");
    panel.tapMore("/");
    expect(panel.isOpen("/transactions")).toBe(false);
    expect(panel.isOpen("/")).toBe(false);
  });

  it("still opens normally after returning to that route", () => {
    const panel = new Panel("/");
    panel.tapMore("/");
    panel.isOpen("/transactions");
    panel.isOpen("/");
    expect(panel.tapMore("/")).toBe(true);
  });

  it("is closed before anything opened it", () => {
    expect(new Panel("/").isOpen("/")).toBe(false);
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

/**
 * Exactly one element may carry the shared layoutId. Two at once leaves
 * Framer to pick a source between them and the marker animates in from
 * wherever that resolves, rather than sliding from the previous tab.
 */
describe("indicator ownership", () => {
  const selectedFor = (pathname: string, moreOpen: boolean): string | null =>
    moreOpen || MORE_ITEMS.some((i) => isActive(pathname, i.href))
      ? "more"
      : (MOBILE_TABS.find((i) => isActive(pathname, i.href))?.href ?? null);

  const holders = (pathname: string, moreOpen: boolean) => {
    const selected = selectedFor(pathname, moreOpen);
    return (
      MOBILE_TABS.filter((t) => selected === t.href).length + (selected === "more" ? 1 : 0)
    );
  };

  it("has exactly one holder on every route, panel closed", () => {
    for (const item of [...MOBILE_TABS, ...MORE_ITEMS]) {
      expect(holders(item.href, false)).toBe(1);
    }
  });

  it("has exactly one holder with the panel open", () => {
    // The regression: opening the panel from a main tab left that tab holding
    // the id while More took a second copy.
    for (const item of [...MOBILE_TABS, ...MORE_ITEMS]) {
      expect(holders(item.href, true)).toBe(1);
    }
  });

  it("hands the indicator to More while its panel is open", () => {
    expect(selectedFor("/", true)).toBe("more");
    expect(selectedFor("/transactions", true)).toBe("more");
  });

  it("returns it to the route's tab once the panel closes", () => {
    expect(selectedFor("/", false)).toBe("/");
    expect(selectedFor("/transactions", false)).toBe("/transactions");
  });
});
