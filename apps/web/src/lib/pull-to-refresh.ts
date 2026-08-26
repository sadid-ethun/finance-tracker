/** Finger travel, after damping, that arms a refresh. */
export const PULL_THRESHOLD = 72;

/**
 * Resistance. Without damping the sheet tracks the finger 1:1 and feels like
 * dragging a div; native pull-to-refresh gets progressively harder, which is
 * what tells you a threshold exists before you reach it.
 */
export const PULL_RESISTANCE = 0.45;

/**
 * How far the indicator travels for a given finger movement.
 *
 * Lives here rather than inside the component so the tests exercise the same
 * arithmetic the gesture runs. The previous version of this feature kept a
 * second copy of the constants in the test file, which meant the tests would
 * have gone on passing had the component's numbers changed.
 *
 * Upward movement returns 0: that is a scroll, and treating it as a negative
 * pull would fight the scroller for the same gesture.
 */
export function pullFor(fingerDelta: number): number {
  if (fingerDelta <= 0) return 0;
  // Capped, so a long drag cannot push the content off screen.
  return Math.min(fingerDelta * PULL_RESISTANCE, PULL_THRESHOLD * 1.5);
}
