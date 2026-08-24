"use client";

import type { ReactNode } from "react";
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
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        {/* Heavier than a light-theme scrim would be: on a near-black canvas
            a 30% overlay is barely perceptible, so the sheet would not read
            as separated from the page behind it. */}
        <Drawer.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px]" />
        <Drawer.Content
          aria-describedby={undefined}
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 flex max-h-[88vh] flex-col",
            "rounded-t-[16px] border-t border-border bg-card outline-none",
            // Content must clear the home indicator, not sit under it.
            "pb-[env(safe-area-inset-bottom)]",
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
