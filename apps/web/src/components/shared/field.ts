/**
 * One form field, everywhere.
 *
 * The add dialogs had four spellings of the same control: selects at px-3,
 * text inputs at px-3.5, and a focus ring on some but not others. Stacked
 * vertically that reads as fields of different widths — the boxes line up, but
 * the text inside them starts two pixels apart, and the eye follows the text.
 *
 * Selects were the odd one out for a plausible reason — the native chevron
 * needs room on the right — but taking it off the left never bought anything.
 */
export const FIELD =
  "h-11 w-full min-w-0 rounded-[14px] border border-input bg-background px-3.5 text-[15px] outline-none focus:border-ring focus:ring-2 focus:ring-ring/20";

/**
 * A date input, which needs one thing more.
 *
 * iOS gives input[type="date"] an intrinsic minimum width from its native
 * rendering, and that wins over w-full — so the field grew past the ones above
 * it and ran out of the sheet. appearance-none releases it; the picker still
 * opens on tap, only the platform's own sizing and chrome go.
 *
 * Not on FIELD itself: the same property strips the chevron off a select, and
 * that chevron is the only thing saying it opens a menu.
 */
export const FIELD_DATE = `${FIELD} appearance-none`;
