"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Drawer } from "vaul";

import { cn } from "@/lib/utils";

/**
 * Bottom sheet.
 *
 * Vaul rather than a hand-rolled fixed panel: it carries the drag-to-dismiss
 * and velocity handling that make a sheet feel native rather than like a div
 * that appeared, plus focus trapping and scroll locking that the hand-rolled
 * version did not have.
 *
 * On desktop it becomes a right-hand panel — the drag affordance is
 * meaningless with a mouse, and the previous layout already did this.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  children,
  footer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const panel = useRef<HTMLDivElement | null>(null);
  const filler = useRef<HTMLDivElement | null>(null);


  /**
   * How far the keyboard intrudes from the bottom of the window.
   *
   * iOS does not resize the layout viewport when the keyboard opens, so a
   * bottom-anchored sheet keeps its bottom edge under the keyboard and any
   * field near it becomes unreachable. Only visualViewport reports the change.
   *
   * Vaul offers repositionInputs for this and it is turned off below: it
   * shifted the whole drawer up by the keyboard height, which on a
   * content-height sheet left the panel clipped in the middle of the form with
   * the overlay showing beneath it. Lifting the sheet by the same measurement
   * keeps it anchored to the top of the keyboard instead, so the form is
   * whole and the field being typed into is above the keys.
   */
  const [keyboard, setKeyboard] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!open || !vv) return;

    const measure = () => {
      // What the window has that the visible area does not.
      const hidden = window.innerHeight - vv.height - vv.offsetTop;
      // Rounded, so sub-pixel drift during the keyboard animation does not
      // re-render on every frame.
      setKeyboard(Math.max(0, Math.round(hidden)));
    };

    // Focus is what raises the keyboard, so focus is what starts measuring.
    //
    // Relying on visualViewport's resize event alone was the bug. Simulating a
    // keyboard in a desktop browser showed the arithmetic and the layout both
    // correct — padding applied, card reaching the bottom of the screen — which
    // leaves only the event never arriving. iOS does not reliably fire it in a
    // standalone web app, and with no synchronous measurement either (a
    // setState in an effect body cascades a render the compiler lint rejects)
    // the height stayed 0 forever and no padding was ever applied.
    //
    // Sampling across the keyboard animation instead: it takes about a quarter
    // of a second to slide up, and polling for twice that costs a handful of
    // frames once per focus. The resize listener stays because where it does
    // fire it is faster and catches the keyboard closing or switching between
    // the number pad and letters, which differ in height.
    let poll = 0;
    const sample = () => {
      const started = Date.now();
      cancelAnimationFrame(poll);
      const step = () => {
        measure();
        if (Date.now() - started < 500) poll = requestAnimationFrame(step);
      };
      poll = requestAnimationFrame(step);
    };

    // On document, not on the panel: the panel mounts inside a portal and its
    // ref may still be null when this runs. Focus is trapped in the sheet
    // while it is open, so anything focused here is in it.
    document.addEventListener("focusin", sample);
    document.addEventListener("focusout", sample);
    vv.addEventListener("resize", measure);
    vv.addEventListener("scroll", measure);
    return () => {
      cancelAnimationFrame(poll);
      document.removeEventListener("focusin", sample);
      document.removeEventListener("focusout", sample);
      vv.removeEventListener("resize", measure);
      vv.removeEventListener("scroll", measure);
      // Reset on close, or the next open starts lifted by the last keyboard.
      setKeyboard(0);
    };
  }, [open]);

  /**
   * Temporary: what the sheet and the viewport actually measure, on device.
   *
   * Enabled with ?sheetdebug=1. Five fixes have now reasoned from an
   * assumption about how iOS reports the keyboard and been wrong, so this
   * reports the numbers instead. Writes straight to the DOM, like the pull
   * gesture's readout did — React state would change the timing of what it is
   * measuring. Delete once the sheet sits right.
   */
  const readout = useRef<HTMLPreElement | null>(null);
  const [debugging] = useState(
    () =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).has("sheetdebug"),
  );

  useEffect(() => {
    if (!debugging || !open) return;
    let frame = 0;

    const tick = () => {
      const box = readout.current;
      const vv = window.visualViewport;
      if (box && vv) {
        const p = panel.current?.getBoundingClientRect();
        const f = filler.current?.getBoundingClientRect();
        box.textContent = [
          `innerHeight  ${window.innerHeight}`,
          `vv.height    ${Math.round(vv.height)}`,
          `vv.offsetTop ${Math.round(vv.offsetTop)}`,
          `vv.pageTop   ${Math.round(vv.pageTop)}`,
          `scrollY      ${Math.round(window.scrollY)}`,
          `kbd (state)  ${keyboard}`,
          p ? `sheet  ${Math.round(p.top)}..${Math.round(p.bottom)} h=${Math.round(p.height)}` : "sheet  -",
          f ? `filler ${Math.round(f.top)}..${Math.round(f.bottom)} h=${Math.round(f.height)}` : "filler -",
        ].join("\n");
      }
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [debugging, open, keyboard]);

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} repositionInputs={false}>
      <Drawer.Portal>
        {/* Heavier than a light-theme scrim would be: on a near-black canvas
            a 30% overlay is barely perceptible, so the sheet would not read
            as separated from the page behind it. */}
        <Drawer.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px]" />
        <Drawer.Content
          ref={panel}
          aria-describedby={undefined}
          /**
           * Do not put focus in the first field on open.
           *
           * The default lands on whatever is focusable first, which in both add
           * dialogs is a text input — so the keyboard sprang up unasked, and
           * iOS scrolled the page behind the sheet to bring that field into
           * view. That is the jump to the bottom of the page, and it survived
           * moving these into a portal because it was never about stacking.
           *
           * Focus moves to the panel itself rather than nowhere. Leaving it on
           * the trigger would put the next Tab press back in the page behind
           * the sheet; on the panel, tabbing walks the form and the focus trap
           * holds. Radix gives Content tabIndex={-1}, so it can take focus
           * without becoming a stop of its own.
           */
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            panel.current?.focus();
          }}
          style={{
            // Padded, not lifted.
            //
            // Setting `bottom` to the measured keyboard height put the sheet's
            // edge exactly where the keys were meant to start, so any error in
            // that measurement showed as a strip of the page between the two.
            // Staying anchored to the bottom and padding instead means the card
            // always reaches the bottom of the screen: the content still clears
            // the keys, and a wrong measurement costs a few pixels of card
            // behind the keyboard, where nobody can see them.
            paddingBottom: keyboard || undefined,
            // Content is capped at whichever is smaller — the usual 88% of the
            // screen, or what is left above the keyboard — and the padding is
            // added back on top of that.
            maxHeight: `calc(${keyboard}px + min(88dvh, 100dvh - ${keyboard + 8}px))`,
          }}
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 flex flex-col",
            "rounded-t-[16px] border-t border-border bg-card outline-none",
            // Clears the home indicator when there is no keyboard doing it
            // already. Inline padding above wins when there is.
            "pb-[env(safe-area-inset-bottom)]",
            "sm:inset-y-0 sm:right-0 sm:left-auto sm:w-[420px] sm:rounded-none sm:border-t-0 sm:border-l",
          )}
        >
          {/*
            Card colour continuing below the sheet, for as far as there is
            screen.

            Everything above depends on measuring the keyboard correctly, and
            iOS gives several ways for that to be wrong: visualViewport may not
            fire in a standalone web app, and a position:fixed element can drift
            while the keyboard is up. Any of those leaves a strip of the page
            showing between the sheet and the keys — which is what kept coming
            back.

            This does not measure anything. It paints from the sheet's own
            bottom edge downwards, so whatever is under the sheet is the sheet's
            colour whether the maths above was right or not. Off screen and
            invisible when there is no keyboard, out of flow so it moves
            nothing, and inherited rounding is irrelevant below the fold.
          */}
          <div
            ref={filler}
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-full h-screen bg-card"
          />

          {/* Temporary, with the readout above. */}
          {debugging ? (
            <pre
              ref={readout}
              className="pointer-events-none fixed top-1 left-1 z-[100] rounded bg-black/85 px-1.5 py-1 font-mono text-[10px] leading-tight text-lime-300"
            >
              measuring…
            </pre>
          ) : null}

          {/* Grab handle: the only affordance telling you this can be dragged. */}
          <div
            aria-hidden
            className="mx-auto mt-2.5 h-1 w-9 shrink-0 rounded-full bg-muted-foreground/40 sm:hidden"
          />
          <div className="flex-1 overflow-y-auto p-5">
            <Drawer.Title className="sr-only">{title}</Drawer.Title>
            {children}
          </div>
          {footer ? (
            <div className="shrink-0 border-t border-border p-4">{footer}</div>
          ) : null}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
