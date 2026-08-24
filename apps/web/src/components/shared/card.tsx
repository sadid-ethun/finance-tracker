import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The card surface.
 *
 * One recipe, in one place. The surface step against the canvas is only
 * 1.13:1 (DESIGN_SYSTEM.md), so the hairline border is doing most of the work
 * of saying "this is a card" — which means a card without the border stops
 * reading as one. Centralising it is what stops that drifting.
 *
 * No shadow, ever. Elevation is a colour step in this system.
 */
export function Card({
  children,
  className,
  interactive = false,
}: {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-card border border-border bg-card",
        // Touch has no hover, so a pressed state is the only feedback a phone
        // ever gives. Never hover-only.
        interactive && "transition-colors active:bg-secondary md:hover:bg-secondary",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * The uppercase tracked mono label.
 *
 * This is the anchor of the type system — the one place the style reference
 * and the product screenshots agree exactly. It carries section headings
 * ("NET WORTH", "THIS MONTH") and reads as instrument panel rather than
 * document heading, which is the whole point.
 *
 * Deliberately not a heading level by default: most of these sit above a card
 * in a page that already has an h1, and `as` is there for the cases that
 * genuinely need one.
 */
export function SectionLabel({
  children,
  as: Tag = "p",
  className,
}: {
  children: ReactNode;
  as?: "p" | "h2" | "h3";
  className?: string;
}) {
  return (
    <Tag
      className={cn(
        "font-mono text-[11px] leading-none tracking-[0.18em] text-muted-foreground uppercase",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

/** A labelled section: mono label outside the card, per PLAN.md section 21. */
export function Section({
  label,
  action,
  children,
  className,
}: {
  label: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <SectionLabel as="h2">{label}</SectionLabel>
        {action}
      </div>
      {children}
    </section>
  );
}
