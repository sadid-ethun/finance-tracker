import { describe, expect, it } from "vitest";

/**
 * The gesture's arithmetic, extracted so it can be checked without a
 * touchscreen. These constants mirror pull-to-refresh.tsx.
 */
const THRESHOLD = 72;
const RESISTANCE = 0.45;

const pullFor = (fingerDelta: number) =>
  fingerDelta <= 0 ? 0 : Math.min(fingerDelta * RESISTANCE, THRESHOLD * 1.5);

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
    expect(pullFor(100)).toBeCloseTo(45);
  });

  it("needs a deliberate drag to arm", () => {
    // A short flick should not trigger a refetch of every active query.
    expect(pullFor(80)).toBeLessThan(THRESHOLD);
    expect(pullFor(200)).toBeGreaterThanOrEqual(THRESHOLD);
  });

  it("caps, so a long drag cannot push the content off screen", () => {
    expect(pullFor(10_000)).toBe(THRESHOLD * 1.5);
  });
});
