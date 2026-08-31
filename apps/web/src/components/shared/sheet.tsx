"use client";

import { useRef, type ReactNode } from "react";
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
 *
 * ## Known limitation: the iOS keyboard
 *
 * On an iOS home-screen web app, opening the keyboard leaves a strip of the
 * page visible between the sheet and the keys. Eight attempts failed to fix
 * it, so this is a plain bottom sheet again and the strip stands. It is
 * cosmetic: the form is usable and the fields are reachable.
 *
 * What was learned, so the next attempt does not start where these did:
 *
 *   - The usual fix is `innerHeight - visualViewport.height -
 *     visualViewport.offsetTop`. It works in Safari and returns zero in a
 *     home-screen web app, because innerHeight shrinks with the keyboard
 *     exactly as visualViewport.height does. Anything built on it is a layout
 *     driven by a number that is always 0 — which is why the same code could
 *     measure correctly in a desktop browser and do nothing on the phone.
 *   - Anchoring to `visualViewport.offsetTop + height`, with top and a -100%
 *     translate, avoids that and lands exactly on the mark in a browser
 *     against a simulated keyboard and page shift. It still did not fix the
 *     device, so something beyond the arithmetic is involved.
 *   - Vaul owns `transform` on Drawer.Content for its animation and drag, so
 *     positioning must use the separate `translate` property or be silently
 *     overwritten.
 *   - Extending the sheet's own background far below the fold does not help,
 *     which argues the strip is not simply uncovered ground.
 *   - repositionInputs is Vaul's own answer and is off below: it shifts the
 *     drawer up bodily, which on a content-height sheet clips the form in the
 *     middle. That is worse than the strip.
 *
 * If it is picked up again: a wrapper owning position while Vaul keeps the
 * content, or dropping Vaul here for a plain dialog, are the untried paths.
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
           * view, leaving it at the bottom of the page. This one did work, and
           * is the reason the sheet still opens quietly.
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
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] flex-col",
            "rounded-t-[16px] border-t border-border bg-card outline-none",
            // Content must clear the home indicator, not sit under it.
            "pb-[env(safe-area-inset-bottom)]",
            "sm:inset-y-0 sm:right-0 sm:left-auto sm:w-[420px] sm:max-h-none",
            "sm:rounded-none sm:border-t-0 sm:border-l",
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
