"use client";

import { Plus } from "lucide-react";

import { useState } from "react";

import { useCreateAccount } from "@/hooks/use-finance";
import { ACCOUNT_TYPE_LABELS, isLiability } from "@/lib/format";

const TYPES = ["depository", "credit", "loan", "investment", "other"] as const;

/**
 * Manual account creation. Amounts are entered in major units and converted to
 * minor units here — the only place in the client that multiplies by 100.
 */
export function AddAccountDialog({ trigger }: { trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<string>("depository");
  const [balance, setBalance] = useState("");
  const create = useCreateAccount();

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const major = Number.parseFloat(balance || "0");
    if (Number.isNaN(major)) return;

    await create.mutateAsync({
      name,
      type,
      balance_current: Math.round(major * 100),
      currency: "USD",
    });

    setName("");
    setBalance("");
    setType("depository");
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 items-center gap-1.5 rounded-[14px] bg-primary px-4 text-[14px] font-semibold text-primary-foreground"
      >
        {trigger}
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-0 sm:items-center sm:p-4">
      <div className="w-full max-w-md rounded-t-card border border-border bg-card p-5 sm:rounded-card">
        <h2 className="text-[18px] font-semibold">Add account</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {isLiability(type)
            ? "Enter the amount you currently owe."
            : "Enter the current balance."}
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label htmlFor="acct-name" className="mb-1.5 block text-[13px] font-medium">
              Name
            </label>
            <input
              id="acct-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
              placeholder="Everyday Checking"
              className="h-11 w-full rounded-[14px] border border-input bg-background px-3.5 text-[15px] outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
            />
          </div>

          <div>
            <label htmlFor="acct-type" className="mb-1.5 block text-[13px] font-medium">
              Type
            </label>
            <select
              id="acct-type"
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="h-11 w-full rounded-[14px] border border-input bg-background px-3 text-[15px] outline-none focus:border-ring"
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {ACCOUNT_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="acct-balance" className="mb-1.5 block text-[13px] font-medium">
              {isLiability(type) ? "Amount owed" : "Current balance"}
            </label>
            <input
              id="acct-balance"
              type="number"
              step="0.01"
              min="0"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
              required
              placeholder="0.00"
              className="tabular h-11 w-full rounded-[14px] border border-input bg-background px-3.5 text-[15px] outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
            />
          </div>

          {create.isError ? (
            <p role="alert" className="text-[13px] text-negative">
              Couldn&apos;t save that account.
            </p>
          ) : null}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-11 flex-1 rounded-[14px] border border-border text-[15px] font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={create.isPending}
              className="h-11 flex-1 rounded-[14px] bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-60"
            >
              {create.isPending ? "Saving…" : "Add account"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** The header action, so Accounts opens with Add in the same place Spending does. */
export function AddAccountButton() {
  return (
    <AddAccountDialog
      trigger={
        <>
          <Plus className="size-4" /> Add
        </>
      }
    />
  );
}
