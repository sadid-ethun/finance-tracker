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
   * Where the visible area ends, in layout coordinates.
   *
   * The sheet is anchored to this rather than to the bottom of the window, and
   * that distinction is the whole fix.
   *
   * Seven attempts before this one all reduced to the same number:
   * `innerHeight - visualViewport.height - visualViewport.offsetTop`, which is
   * the fallback every write-up on this recommends. It works in Safari. In a
   * home-screen web app it returns zero, because innerHeight shrinks with the
   * keyboard exactly as visualViewport.height does — subtract two values that
   * moved together and nothing is left. So no padding was ever applied, and
   * every fix built on top of it was fixing a layout that already worked.
   *
   * innerHeight is not read at all now. `offsetTop + height` is where the
   * visible area ends whatever the window thinks its own size is, and it also
   * folds in the page shift: iOS does not merely uncover the keyboard, it
   * pushes the document up, and offsetTop is that push. The old formula
   * subtracted it as if it were more hidden height.
   *
   * Positioned with `top` plus a -100% translate rather than `bottom`, which
   * is the documented technique — bottom resolves against the layout viewport,
   * and the layout viewport is the thing that cannot be trusted here.
   */
  const [anchor, setAnchor] = useState<number | null>(null);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!open || !vv) return;

    const measure = () => {
      // Rounded, so sub-pixel drift during the keyboard animation does not
      // re-render on every frame.
      setAnchor(Math.round(vv.offsetTop + vv.height));
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
      // Reset on close, or the next open starts anchored to the last keyboard.
      setAnchor(null);
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
          `anchor       ${anchor}`,
          p ? `sheet  ${Math.round(p.top)}..${Math.round(p.bottom)} h=${Math.round(p.height)}` : "sheet  -",
        ].join("\n");
      }
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [debugging, open, anchor]);

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
          style={
            anchor === null
              ? undefined
              : {
                  // Bottom edge on the bottom of the *visible* area. `bottom`
                  // would resolve against the layout viewport, which is the
                  // one thing here that cannot be trusted.
                  top: `${anchor}px`,
                  bottom: "auto",
                  // `translate`, not `transform`. Vaul owns transform on this
                  // element — it drives the open animation and the drag from
                  // it — so anything written there is overwritten, which the
                  // browser showed as the sheet landing 95px off its anchor.
                  // translate is a separate property that composes with it.
                  translate: "0 -100%",
                  // Never taller than the visible area, so the form cannot
                  // extend behind the keys it is sitting above.
                  maxHeight: `min(88dvh, ${anchor - 8}px)`,
                }
          }
          className={cn(
            "fixed inset-x-0 z-50 flex flex-col",
            "rounded-t-[16px] border-t border-border bg-card outline-none",
            // Until the visual viewport has been read — and on anything that
            // does not implement it — this is an ordinary bottom sheet.
            "bottom-0 max-h-[88dvh]",
            "pb-[env(safe-area-inset-bottom)]",
            // Desktop is a full-height side panel. The inline styles above are
            // mobile-only concerns, so they are cleared here.
            "sm:inset-y-0! sm:right-0 sm:left-auto sm:w-[420px] sm:max-h-none!",
            // translate-none clears the property actually being set above.
            // transform is left alone: it is Vaul's.
            "sm:translate-none! sm:rounded-none sm:border-t-0 sm:border-l",
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
