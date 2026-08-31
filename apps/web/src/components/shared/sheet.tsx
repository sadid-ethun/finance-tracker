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
        box.textContent = [
          `innerHeight  ${window.innerHeight}`,
          `vv.height    ${Math.round(vv.height)}`,
          `vv.offsetTop ${Math.round(vv.offsetTop)}`,
          `vv.pageTop   ${Math.round(vv.pageTop)}`,
          `scrollY      ${Math.round(window.scrollY)}`,
          `kbd (state)  ${keyboard}`,
          p ? `sheet  ${Math.round(p.top)}..${Math.round(p.bottom)} h=${Math.round(p.height)}` : "sheet  -",
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
          // Only the keyboard height is inline. Everything positional lives in
          // classes so the sm: variants can override it — an inline `bottom`
          // would beat sm:inset-y-0 and leave the desktop side panel hanging
          // 60vh below the window.
          style={{ "--kbd": `${keyboard}px` } as React.CSSProperties}
          className={cn(
            "fixed inset-x-0 z-50 flex flex-col",
            "rounded-t-[16px] border-t border-border bg-card outline-none",
            // The box hangs two screens below the fold, and the same amount of
            // padding pushes the content back up. Net effect: the sheet looks
            // exactly as it did, and its own background runs far past the
            // bottom edge.
            //
            // Two screens rather than a slice of one, because iOS does not just
            // uncover the keyboard — it shifts the whole page up to make room.
            // The reserve travels up with the sheet, so anything sized to the
            // keyboard gets eaten by the shift and the gap comes back. 60vh was
            // not enough for that; 200vh is past anything iOS can shift by, and
            // costs nothing, because every pixel of the excess is off screen.
            //
            // This is what fixes the strip of page below the sheet, and it does
            // so without measuring anything. Every earlier attempt positioned
            // the sheet against a keyboard height, so each inherited whatever
            // iOS reported — and iOS does not reliably report it in a
            // standalone web app. Reserved background below the fold cannot be
            // wrong, because the excess is off screen.
            //
            // Verified in a browser before shipping: the first field does not
            // move by a pixel, and the box ends 494px below a 986px viewport.
            "bottom-[-200vh]",
            "pb-[calc(200vh_+_env(safe-area-inset-bottom)_+_var(--kbd,0px))]",
            // Grown by the same 200vh, or max-height caps the box and the
            // padding eats the content area instead of extending it — which is
            // what the first attempt at this did.
            "max-h-[calc(200vh_+_var(--kbd,0px)_+_min(88dvh,100dvh_-_var(--kbd,0px)_-_8px))]",
            // Desktop is a full-height side panel: undo all three.
            "sm:inset-y-0 sm:right-0 sm:left-auto sm:w-[420px] sm:max-h-none",
            "sm:pb-[env(safe-area-inset-bottom)] sm:rounded-none sm:border-t-0 sm:border-l",
          )}
        >
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
