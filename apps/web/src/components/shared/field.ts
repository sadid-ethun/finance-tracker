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
  "h-11 w-full rounded-[14px] border border-input bg-background px-3.5 text-[15px] outline-none focus:border-ring focus:ring-2 focus:ring-ring/20";
