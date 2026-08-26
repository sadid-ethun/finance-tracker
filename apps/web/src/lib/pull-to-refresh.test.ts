import { describe, expect, it } from "vitest";

import { PULL_RESISTANCE, PULL_THRESHOLD, pullFor } from "./pull-to-refresh";

/**
 * The gesture's arithmetic, checkable without a touchscreen.
 *
 * Imported rather than restated. The reverted version of this feature kept its
 * own copy of the constants here, so the tests would have gone on passing if
 * the component's numbers had changed underneath them.
 */
describe("pull distance", () => {
  it("ignores upward drags entirely", () => {
    // An upward drag is a scroll. Treating it as a negative pull would fight
    // the scroller for the same gesture.
    expect(pullFor(-40)).toBe(0);
    expect(pullFor(0)).toBe(0);
  });

  it("damps the finger rather than tracking it 1:1", () => {
    // Native pull-to-refresh gets progressively harder; 1:1 tracking feels
    // like dragging a div.
    expect(pullFor(100)).toBeLessThan(100);
    expect(pullFor(100)).toBeCloseTo(100 * PULL_RESISTANCE);
  });

  it("needs a deliberate drag to arm", () => {
    // A short flick should not trigger a refetch of every active query.
    expect(pullFor(80)).toBeLessThan(PULL_THRESHOLD);
    expect(pullFor(200)).toBeGreaterThanOrEqual(PULL_THRESHOLD);
  });

  it("caps, so a long drag cannot push the content off screen", () => {
    expect(pullFor(10_000)).toBe(PULL_THRESHOLD * 1.5);
  });

  it("stays monotonic up to the cap", () => {
    // The indicator must never travel backwards while the finger moves down —
    // that would read as the gesture being rejected mid-pull.
    for (let delta = 1; delta < PULL_THRESHOLD * 2; delta += 7) {
      expect(pullFor(delta + 7)).toBeGreaterThanOrEqual(pullFor(delta));
    }
  });
});
