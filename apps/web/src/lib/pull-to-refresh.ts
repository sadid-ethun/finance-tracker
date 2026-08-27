/**
 * Finger travel, after damping, that arms a refresh.
 *
 * Deliberately short. At 72 with the old resistance a refresh took 160px of
 * deliberate dragging — most of a phone screen — so an ordinary swipe at the
 * top of the page did nothing and the gesture felt broken rather than absent.
 * 40 against the resistance below is about 67px, which is a swipe.
 */
export const PULL_THRESHOLD = 40;

/**
 * Resistance. Without damping the sheet tracks the finger 1:1 and feels like
 * dragging a div; native pull-to-refresh gets progressively harder, which is
 * what tells you a threshold exists before you reach it.
 */
export const PULL_RESISTANCE = 0.6;

/**
 * Downward speed, in px/ms at release, that arms a refresh on its own.
 *
 * A flick is a swipe that ends before it has travelled far. Distance alone
 * cannot see one — the finger leaves the glass at 40px having clearly meant
 * it — so speed is a second way to qualify rather than a modifier on the
 * first.
 */
export const PULL_FLICK_VELOCITY = 0.35;

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

/**
 * Whether releasing here should refresh.
 *
 * Either qualifies: pulled far enough, or moving fast enough to mean it. A
 * flick is only honoured once the gesture has actually gone somewhere, so a
 * fast tap with a pixel of jitter cannot trigger a refetch of everything.
 */
export function shouldRefresh(distance: number, velocity: number): boolean {
  if (distance >= PULL_THRESHOLD) return true;
  return velocity >= PULL_FLICK_VELOCITY && distance > PULL_THRESHOLD / 4;
}
