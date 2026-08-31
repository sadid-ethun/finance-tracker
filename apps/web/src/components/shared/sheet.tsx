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

    // Not measured synchronously here. The sheet opens with no field focused
    // and so no keyboard, which is what 0 already says — and a setState in an
    // effect body cascades a render the compiler lint rejects. The first real
    // measurement comes from the event, which is when it first differs.
    vv.addEventListener("resize", measure);
    vv.addEventListener("scroll", measure);
    return () => {
      vv.removeEventListener("resize", measure);
      vv.removeEventListener("scroll", measure);
      // Reset on close, or the next open starts lifted by the last keyboard.
      setKeyboard(0);
    };
  }, [open]);

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
            bottom: keyboard,
            // Against the visible area, not the window: 88vh with the keyboard
            // up is taller than the space left to draw in.
            maxHeight: `calc(88dvh - ${keyboard}px)`,
          }}
          className={cn(
            "fixed inset-x-0 z-50 flex flex-col",
            "rounded-t-[16px] border-t border-border bg-card outline-none",
            // Content must clear the home indicator, not sit under it — but
            // only when the keyboard is not already holding it clear.
            keyboard === 0 && "pb-[env(safe-area-inset-bottom)]",
            "sm:inset-y-0 sm:right-0 sm:left-auto sm:w-[420px] sm:rounded-none sm:border-t-0 sm:border-l",
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
