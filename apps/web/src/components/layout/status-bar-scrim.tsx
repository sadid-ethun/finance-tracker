/**
 * A blurred strip behind the status bar.
 *
 * The viewport is `viewport-fit=cover`, so the page extends under the clock
 * and the battery. Nothing accounted for that: the bottom inset is handled in
 * three places, the top in none, so scrolled content ran straight into the
 * system text — a balance and the time occupying the same pixels.
 *
 * Sized by `env(safe-area-inset-top)`, which is the height of that region and
 * zero on any device or browser that does not have one. So this is self
 * cancelling: no notch, no strip, no need to detect anything.
 *
 * Blurred harder than the tab bar (12px against 8px) and tinted heavier,
 * because the two are doing different jobs. The tab bar wants you to see what
 * is behind it; this wants the white system text on top of it to stay legible
 * over whatever happens to scroll past, which means the backdrop has to lose
 * its detail rather than keep it.
 *
 * Below the tab bar's z-50 and above the sticky filter row's z-30, so it
 * covers content scrolling under it without ever covering navigation.
 */
export function StatusBarScrim() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-40 h-[env(safe-area-inset-top)] backdrop-blur-md backdrop-saturate-[1.8] lg:hidden"
      style={{
        backgroundColor: "color-mix(in srgb, var(--tabbar-tint) 75%, transparent)",
      }}
    />
  );
}
