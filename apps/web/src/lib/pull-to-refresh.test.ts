import { describe, expect, it } from "vitest";

import {
  PULL_FLICK_VELOCITY,
  PULL_RESISTANCE,
  PULL_THRESHOLD,
  pullFor,
  shouldRefresh,
} from "./pull-to-refresh";

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

  it("arms within an ordinary swipe", () => {
    // The whole point of the retune: arming used to need 160px of deliberate
    // dragging, so a normal swipe at the top of the page did nothing and the
    // gesture read as broken rather than absent. ~67px now.
    const travelToArm = PULL_THRESHOLD / PULL_RESISTANCE;
    expect(travelToArm).toBeLessThan(80);
    expect(pullFor(travelToArm)).toBeGreaterThanOrEqual(PULL_THRESHOLD);
  });

  it("does not arm on a few pixels of jitter", () => {
    expect(pullFor(8)).toBeLessThan(PULL_THRESHOLD);
  });

  it("caps, so a long drag cannot push the content off screen", () => {
    expect(pullFor(10_000)).toBe(PULL_THRESHOLD * 1.5);
  });

  it("stays monotonic up to the cap", () => {
    // The indicator must never travel backwards while the finger moves down —
    // that would read as the gesture being rejected mid-pull.
    for (let delta = 1; delta < PULL_THRESHOLD * 4; delta += 7) {
      expect(pullFor(delta + 7)).toBeGreaterThanOrEqual(pullFor(delta));
    }
  });
});

describe("shouldRefresh", () => {
  it("refreshes once pulled far enough, however slowly", () => {
    // A slow deliberate drag has no velocity to speak of by the time it stops.
    expect(shouldRefresh(PULL_THRESHOLD, 0)).toBe(true);
    expect(shouldRefresh(PULL_THRESHOLD * 2, 0)).toBe(true);
  });

  it("refreshes on a flick that ends short", () => {
    // A flick is a swipe that leaves the glass before it has travelled far.
    // Distance alone cannot see one, which is why velocity qualifies too.
    const short = PULL_THRESHOLD / 2;
    expect(shouldRefresh(short, 0)).toBe(false);
    expect(shouldRefresh(short, PULL_FLICK_VELOCITY)).toBe(true);
  });

  it("ignores a fast tap with a pixel of movement", () => {
    // Speed alone must not qualify, or every quick tap near the top of the
    // page would refetch everything on screen.
    expect(shouldRefresh(1, PULL_FLICK_VELOCITY * 10)).toBe(false);
  });

  it("ignores an upward flick", () => {
    // Velocity is signed: upward is negative and can never qualify.
    expect(shouldRefresh(0, -5)).toBe(false);
  });
});
