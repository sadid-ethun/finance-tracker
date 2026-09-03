"use client";

import { createContext, useCallback, useContext, useSyncExternalStore } from "react";

const STORAGE_KEY = "fintrac:decoy";

/**
 * Decoy amounts, for showing the app to someone.
 *
 * Every figure is multiplied by one factor rather than each being replaced
 * with an independent invention. That choice is the whole design: net worth is
 * assets minus liabilities, the tiles sum to the totals, the account rows sum
 * to the tiles, and the chart is the same series the figure sits on top of.
 * Fake each of those separately and the screen contradicts itself — a total
 * that does not match the rows under it reads as a bug, and the one thing a
 * decoy must not do is look broken.
 *
 * Scaling keeps every one of those relationships true, so the page stays
 * internally consistent and nothing has to be recomputed.
 *
 * What it is not: this hides amounts from someone reading over your shoulder
 * or looking at a screenshot. It is not a security control. Ratios survive
 * scaling, so anyone who knows one real balance can derive the rest — and the
 * real values are still in the page's data either way.
 */

/** Chosen to look plausible and to be nothing like 1. */
const FACTOR = 3.17;

type Decoy = {
  enabled: boolean;
  toggle: () => void;
  /** Minor units in, minor units out. Identity when off. */
  amount: (minorUnits: number) => number;
};

const DecoyContext = createContext<Decoy>({
  enabled: false,
  toggle: () => {},
  amount: (n) => n,
});

/**
 * The scaling function itself, carried separately from the flag.
 *
 * It has to reach DecoyScope without passing through DecoyContext, because
 * DecoyContext is what DecoyScope overrides — reading and replacing the same
 * context in one component means reading the value it is about to shadow.
 */
const ScaleContext = createContext<(minorUnits: number) => number>((n) => n);

export function useDecoy(): Decoy {
  return useContext(DecoyContext);
}

/**
 * localStorage read through useSyncExternalStore rather than an effect.
 *
 * It is the API built for exactly this: external state React does not own.
 * getServerSnapshot answers for the server, where there is no storage, so
 * hydration matches instead of flashing the wrong state — and no setState runs
 * in an effect body, which the compiler lint rejects and which would cascade a
 * render on every mount besides.
 */
const EVENT = "fintrac:decoy-changed";

function subscribe(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange);
  // Also across tabs: `storage` fires in every other document but not the one
  // that wrote, which is why the custom event above exists as well.
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readEnabled(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    // Private mode, or storage disabled. Off is the safe default: it shows the
    // real numbers, which is what someone who never set this expects.
    return false;
  }
}

/** The server has no storage, and off is what it should render. */
function readServer(): boolean {
  return false;
}

export function DecoyProvider({ children }: { children: React.ReactNode }) {
  const enabled = useSyncExternalStore(subscribe, readEnabled, readServer);

  const toggle = useCallback(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, readEnabled() ? "0" : "1");
    } catch {
      // Not persisting is survivable, but without storage there is nothing for
      // the snapshot to read back, so the toggle cannot stick. Better than
      // throwing on a tap.
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);

  const amount = useCallback(
    (minorUnits: number) => (enabled ? Math.round(minorUnits * FACTOR) : minorUnits),
    [enabled],
  );

  return (
    <DecoyContext.Provider value={{ enabled, toggle, amount: (n) => n }}>
      <ScaleContext.Provider value={amount}>{children}</ScaleContext.Provider>
    </DecoyContext.Provider>
  );
}

/**
 * Marks a subtree whose amounts follow the toggle.
 *
 * The toggle's state is app-wide — Settings has to reach it — but the effect
 * is not: this was asked for on Accounts, and a total on Spending that
 * disagreed with the transactions under it would be worse than showing the
 * real one. So the scaling is opt-in per subtree, and adding a screen later is
 * one wrapper.
 *
 * Money outside a scope is untouched no matter what the toggle says.
 */
export function DecoyScope({ children }: { children: React.ReactNode }) {
  const scale = useContext(ScaleContext);
  const outer = useContext(DecoyContext);

  return (
    <DecoyContext.Provider
      value={{ enabled: outer.enabled, toggle: outer.toggle, amount: scale }}
    >
      {children}
    </DecoyContext.Provider>
  );
}
