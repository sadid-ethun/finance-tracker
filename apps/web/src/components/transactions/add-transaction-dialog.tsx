"use client";

import { useState } from "react";

import { Sheet } from "@/components/shared/sheet";
import { useAccounts, useAssignableCategories, useCreateTransaction } from "@/hooks/use-finance";
import { isLiability } from "@/lib/format";

/**
 * Manual transaction entry.
 *
 * The user picks "Expense" or "Income" rather than typing a signed number; the
 * sign convention (negative is money out, on every account type including
 * credit cards) is applied here so it can never be entered wrong.
 */
export function AddTransactionDialog({
  trigger,
  accountId,
}: {
  trigger: React.ReactNode;
  accountId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<"expense" | "income">("expense");
  const [account, setAccount] = useState(accountId ?? "");
  const [amount, setAmount] = useState("");
  const [name, setName] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [categoryId, setCategoryId] = useState("");

  const accounts = useAccounts();
  const categories = useAssignableCategories();
  const create = useCreateTransaction();

  const selected = (accounts.data ?? []).find((a) => a.id === (accountId ?? account));

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const major = Number.parseFloat(amount);
    if (Number.isNaN(major) || major <= 0) return;

    const minor = Math.round(major * 100);

    await create.mutateAsync({
      account_id: accountId ?? account,
      amount: direction === "expense" ? -minor : minor,
      date,
      name,
      category_id: categoryId || null,
    });

    setAmount("");
    setName("");
    setCategoryId("");
    setOpen(false);
  }

  const usableCategories = (categories.data ?? []).filter((c) =>
    direction === "income" ? c.kind !== "expense" : c.kind !== "income",
  );

  // Same reasoning as add-account-dialog: the trigger stays mounted and the
  // sheet portals out, rather than the trigger swapping itself for a fixed
  // panel that the tab bar then painted over.
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 items-center gap-1.5 rounded-[14px] bg-primary px-4 text-[14px] font-semibold text-primary-foreground"
      >
        {trigger}
      </button>

      <Sheet open={open} onOpenChange={setOpen} title="Add transaction">
        <h2 className="text-[18px] font-semibold">Add transaction</h2>

        <div className="mt-4 grid grid-cols-2 gap-1 rounded-[14px] bg-secondary p-1">
          {(["expense", "income"] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDirection(d)}
              className={`h-9 rounded-[11px] text-[14px] font-medium capitalize ${
                direction === d ? "bg-card shadow-sm" : "text-muted-foreground"
              }`}
            >
              {d}
            </button>
          ))}
        </div>

        {selected && isLiability(selected.type) ? (
          <p className="mt-2 text-[12px] text-muted-foreground">
            On a {selected.type} account, an expense increases what you owe.
          </p>
        ) : null}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {!accountId ? (
            <div>
              <label htmlFor="tx-account" className="mb-1.5 block text-[13px] font-medium">
                Account
              </label>
              <select
                id="tx-account"
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                required
                className="h-11 w-full rounded-[14px] border border-input bg-background px-3 text-[15px] outline-none focus:border-ring"
              >
                <option value="">Select an account…</option>
                {(accounts.data ?? []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div>
            <label htmlFor="tx-amount" className="mb-1.5 block text-[13px] font-medium">
              Amount
            </label>
            <input
              id="tx-amount"
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              placeholder="0.00"
              className="tabular h-11 w-full rounded-[14px] border border-input bg-background px-3.5 text-[15px] outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
            />
          </div>

          <div>
            <label htmlFor="tx-name" className="mb-1.5 block text-[13px] font-medium">
              Description
            </label>
            <input
              id="tx-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="Whole Foods"
              className="h-11 w-full rounded-[14px] border border-input bg-background px-3.5 text-[15px] outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
            />
          </div>

          <div>
            <label htmlFor="tx-date" className="mb-1.5 block text-[13px] font-medium">
              Date
            </label>
            <input
              id="tx-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className="h-11 w-full rounded-[14px] border border-input bg-background px-3.5 text-[15px] outline-none focus:border-ring"
            />
          </div>

          <div>
            <label htmlFor="tx-category" className="mb-1.5 block text-[13px] font-medium">
              Category
            </label>
            <select
              id="tx-category"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="h-11 w-full rounded-[14px] border border-input bg-background px-3 text-[15px] outline-none focus:border-ring"
            >
              <option value="">Uncategorized</option>
              {usableCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {create.isError ? (
            <p role="alert" className="text-[13px] text-negative">
              Couldn&apos;t save that transaction.
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
              {create.isPending ? "Saving…" : "Add"}
            </button>
          </div>
        </form>
      </Sheet>
    </>
  );
}
