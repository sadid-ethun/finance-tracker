"use client";

import { useCallback, useEffect, useState } from "react";
import { usePlaidLink, type PlaidLinkOnSuccess } from "react-plaid-link";
import { Plus } from "lucide-react";

import { useCreateLinkToken, useExchangePublicToken } from "@/hooks/use-finance";

/**
 * Plaid Link handshake.
 *
 * The public token Link returns is short-lived and useless on its own; the
 * server exchanges it for the real access token, which never reaches the
 * browser (PLAN.md section 9).
 *
 * `itemId` switches Link into update mode, which re-authenticates an existing
 * connection instead of creating a duplicate.
 */
export function ConnectBankButton({
  itemId,
  label = "Connect a bank",
  variant = "primary",
}: {
  itemId?: string;
  label?: string;
  variant?: "primary" | "subtle";
}) {
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const createToken = useCreateLinkToken();
  const exchange = useExchangePublicToken();

  const onSuccess = useCallback<PlaidLinkOnSuccess>(
    async (publicToken, metadata) => {
      // Update mode completes without a public token — there is nothing new to
      // exchange, the existing item was simply re-authenticated.
      if (!publicToken) {
        setToken(null);
        return;
      }
      try {
        await exchange.mutateAsync({
          public_token: publicToken,
          institution_id: metadata.institution?.institution_id ?? null,
          institution_name: metadata.institution?.name ?? null,
        });
      } catch {
        setError("Connected, but we couldn't finish setting it up.");
      } finally {
        setToken(null);
      }
    },
    [exchange],
  );

  const { open, ready } = usePlaidLink({
    token,
    onSuccess,
    onExit: () => setToken(null),
  });

  // Link must be opened only once its token is loaded and the SDK is ready.
  useEffect(() => {
    if (token && ready) open();
  }, [token, ready, open]);

  async function start() {
    setError(null);
    try {
      const result = await createToken.mutateAsync(
        itemId ? { mode: "update", item_id: itemId } : { mode: "connect" },
      );
      setToken(result.link_token);
    } catch (err) {
      const code = (err as { code?: string })?.code;
      setError(
        code === "PLAID_NOT_CONFIGURED"
          ? "Plaid isn't configured yet. Add your API keys to get started."
          : "Couldn't start the connection.",
      );
    }
  }

  const pending = createToken.isPending || exchange.isPending || Boolean(token);

  return (
    <div>
      <button
        type="button"
        onClick={start}
        disabled={pending}
        className={
          variant === "primary"
            ? "inline-flex h-10 items-center gap-1.5 rounded-[14px] bg-primary px-4 text-[14px] font-semibold text-primary-foreground disabled:opacity-60"
            : "inline-flex h-9 items-center gap-1.5 rounded-[12px] border border-border px-3 text-[13px] font-medium disabled:opacity-60"
        }
      >
        {variant === "primary" ? <Plus className="size-4" /> : null}
        {pending ? "Opening…" : label}
      </button>
      {error ? (
        <p role="alert" className="mt-2 text-[13px] text-negative">
          {error}
        </p>
      ) : null}
    </div>
  );
}
