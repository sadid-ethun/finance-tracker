"use client";

import { Card } from "@/components/shared/card";
import { Switch } from "@/components/shared/switch";
import { useDecoy } from "@/lib/decoy";

/**
 * Swap the figures on Accounts for plausible ones.
 *
 * For handing someone your phone or posting a screenshot. Every amount is
 * multiplied by one factor, so the page stays internally consistent — the
 * tiles still sum to the total, the rows still sum to the tiles, and the chart
 * is still the series the headline sits on.
 *
 * Deliberately not called anything with "private" or "secure" in it. It hides
 * amounts from someone looking at the screen and nothing more: the real values
 * are still in the page's data, and a single factor preserves every ratio, so
 * one known balance gives up the rest. Naming it after what it does keeps that
 * honest.
 */
export function DecoyToggle() {
  const { enabled, toggle } = useDecoy();

  return (
    <Card as="section" className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-[16px] font-semibold">Decoy amounts</h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Shows made-up figures on Accounts, for screenshots or handing your
            phone over. They stay consistent with each other, so nothing looks
            broken. Everything else keeps its real numbers.
          </p>
        </div>
        <Switch checked={enabled} onChange={toggle} label="Decoy amounts" />
      </div>
      {enabled ? (
        <p role="status" className="mt-3 text-[13px] text-muted-foreground">
          Accounts is showing decoy figures. This device only.
        </p>
      ) : null}
    </Card>
  );
}
