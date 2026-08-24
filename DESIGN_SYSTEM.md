# Design System

Dark-first tokens for the mobile UI, adapted from `DESIGN.md` (an Origin
Financial style reference) to a dashboard application.

`PLAN.md` section 21 remains authoritative on **structure and behaviour** —
what appears where, how it animates, which state variants exist. This document
supersedes it on **colour and type** only.

Nothing here is copied from Origin. Colour values and the three-voice type
system are used as a design reference; all copy, iconography, and the wordmark
are original to this app.

---

## What changed from the reference, and why

`DESIGN.md` describes a marketing site. Four things do not survive contact
with a dashboard, and each was measured rather than assumed.

### Fog fails as muted text

`DESIGN.md` assigns Fog `#6a6b6b` to "muted text and disabled-link colour".
Against the Graphite card it measures **2.54:1** — below the 3:1 floor for any
text, let alone the 4.5:1 that `PLAN.md` section 21 requires.

Muted text is therefore **Ash `#9f9fa0`** (5.14:1 on card, 7.20:1 on canvas).
Fog is retained *only* for genuinely disabled controls, where WCAG exempts it.

### Display type scales down

The reference sets display at 80–96px, sized for a hero headline. The
equivalent element here is a net-worth figure on a 375px screen. The serif
voice is kept, the sizes are not: display tops out at **40px**.

### Page-scale spacing is dropped

1200px max-width, 80px section gaps, and 90px mockup padding are page
furniture. The 4px base unit and the 4–48px steps carry over; 60–140px do not.

### Gain and loss have no reference values

This is the one genuine gap. `DESIGN.md` has no positive/negative pair —
a marketing palette does not need one, a finance app cannot work without one.
The brief asks to derive from the accent set, but violet-for-gain and
pink-for-loss is not legible as money.

So a restrained pair is introduced, tuned for this canvas rather than taken
from the light-mode screenshots: **Mint `#57d9a3`** and **Rose `#ff8fa3`**,
both passing AA at body size on both surfaces. They are single tokens — if you
would rather they came from the accent set, `--positive` and `--negative` are
a one-line change each.

Colour never carries this meaning alone: `PLAN.md` section 21 requires a sign
and an icon alongside, which the `Money` component already renders.

---

## Surfaces

Elevation is expressed as colour steps, never shadow — the reference and
`PLAN.md` already agree on this.

| Level | Token | Value | Use |
|---|---|---|---|
| 0 | `--background` | `#0f1011` | Page canvas |
| 1 | `--card` | `#1c1d1f` | Cards, data modules, list surfaces |
| 2 | `--secondary` | `#292a2d` | Pressed and raised states |
| — | `--border` | `rgba(255,255,255,0.10)` | Hairlines |

Card-on-canvas separation is **1.13:1**, card-to-pressed **1.18:1**.

The reference's Graphite `#2e2e2e` sits at 1.40:1 and reads as too strong a
step on a screen that is mostly cards — a marketing page shows one or two, a
dashboard shows a dozen. A quieter surface costs only separation, and the
hairline border still defines the edge at 1.35:1 against the card.

Darkening is close to free: every text contrast *improves* as the card drops,
because the only thing traded away is the step the eye was objecting to.

## Text

| Token | Value | On canvas | On card |
|---|---|---|---|
| `--foreground` | Cloud `#f5f5f7` | 17.49:1 | 15.49:1 |
| `--muted-foreground` | Ash `#9f9fa0` | 7.20:1 | 6.38:1 |
| `--fog` (disabled only) | `#6a6b6b` | 3.56:1 | 3.16:1 |

Body text is never pure white — Cloud for headings, Ash for descriptions.

## Action

White fill, black text: the single primary action, at 21:1. Chromatic colour
is never a button.

| Token | Value |
|---|---|
| `--primary` | `#ffffff` |
| `--primary-foreground` | `#000000` |

## Accents

Reserved for category identity and data series. Never a border, never a button.

| Token | Value | On card |
|---|---|---|
| `--chart-1` | Cyan Signal `#00b3dd` | 6.82:1 |
| `--chart-2` | Iris Gleam `#847dff` | 5.11:1 |
| `--chart-3` | Orchid Bloom `#dd90d8` | 7.28:1 |
| `--chart-4` | Periwinkle `#90b8f0` | 8.28:1 |
| `--chart-5` | Pale Iris `#d1c9ff` | 10.86:1 |
| `--chart-6` | Silver `#cacaca` | 10.30:1 |

Deep Iris `#4b49aa` is in the reference palette but measures **2.28:1** on
card — still unusable as a series colour even on the darker surface, and
excluded.

Iris Gleam measured 4.11:1 on the reference's Graphite, which limited it to
strokes and dots. On the darker card it reaches 5.11:1 and is usable as a
text colour — the surface change bought it back.

> The reference says to reserve chromatic colour for full-bleed tiles and
> never as inline accents, and not to use it on text under 18px. The brief
> overrides the first: transaction rows keep category colour-coding.
>
> The second is now satisfied on measurement rather than by exception — every
> series colour clears 5:1 on the darker card, so a category label may carry
> its colour. The reference's rule was calibrated against its own lighter
> Graphite surface.

## Type

Three voices, per the reference.

| Role | Family | Size | Weight | Tracking |
|---|---|---|---|---|
| Display | serif | 28–40px | 300 | -0.01em |
| Section label | mono, uppercase | 11px | 400 | 0.18em |
| Data label | mono, uppercase | 12px | 500 | 0.02em |
| Body | sans | 15–16px | 400 | normal |
| Body small | sans | 13–14px | 400 | normal |

The uppercase tracked mono label is the anchor — it is where the reference's
type system and the product screenshots agree exactly, and it carries the
section headings.

Numerals use tabular figures everywhere so balances do not jitter.

## Radius

| Element | Value |
|---|---|
| Cards | 16px |
| Buttons, inputs, nav items | 8px |
| Pills | 9999px |
| Feature tiles | 30px |

## Motion

Reference and `PLAN.md` agree: no springs, no overshoot.

| Pattern | Duration | Easing |
|---|---|---|
| State transition | 200ms | `ease` |
| Layout / shared element | 250ms | `cubic-bezier(0.32,0.72,0,1)` |
| Atmospheric reveal | 600ms | `cubic-bezier(0.455,0.03,0.515,0.955)` |

All motion respects `prefers-reduced-motion`.

## Known errata in the reference

- `--surface-graphite-card: #2e2e2` is five hex digits; the correct value is
  `#2e2e2e`, used here.
- The type section lists six font families for what is three voices, several
  being trial variants of the same face.
