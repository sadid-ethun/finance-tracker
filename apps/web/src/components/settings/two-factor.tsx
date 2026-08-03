"use client";

import { useState } from "react";
import { ShieldCheck, ShieldAlert } from "lucide-react";

import { twoFactor, useSession } from "@/lib/auth-client";

/**
 * TOTP enrolment.
 *
 * PLAN.md section 8 requires this before Plaid Production: the app holds read
 * access to real bank data, and a password alone is not enough to gate that.
 *
 * Enrolment is deliberately three steps — password, scan, verify — because
 * `skipVerificationOnEnable` is false. A mistyped code fails *before* 2FA is
 * switched on, so a misconfigured authenticator cannot lock out the only
 * account this app has.
 */
export function TwoFactorSetup() {
  const { data: session } = useSession();
  const enabled = Boolean(
    (session?.user as { twoFactorEnabled?: boolean } | undefined)?.twoFactorEnabled,
  );

  const [step, setStep] = useState<"idle" | "password" | "verify">("idle");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [uri, setUri] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function startEnrolment(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { data, error: err } = await twoFactor.enable({ password });
      if (err || !data) {
        setError("That password isn't right.");
        return;
      }
      setUri(data.totpURI);
      setBackupCodes(data.backupCodes ?? []);
      setStep("verify");
    } finally {
      setBusy(false);
    }
  }

  async function confirm(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { error: err } = await twoFactor.verifyTotp({ code });
      if (err) {
        setError("That code didn't match. Check your authenticator and try again.");
        return;
      }
      setStep("idle");
      setUri(null);
      setPassword("");
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  async function disable(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { error: err } = await twoFactor.disable({ password });
      if (err) setError("That password isn't right.");
      else {
        setStep("idle");
        setPassword("");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-card border border-border bg-card p-5">
      <div className="flex items-start gap-3">
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-full"
          style={{
            backgroundColor: enabled ? "var(--primary-soft)" : "var(--secondary)",
          }}
        >
          {enabled ? (
            <ShieldCheck className="size-4 text-accent-foreground" strokeWidth={2} />
          ) : (
            <ShieldAlert className="size-4 text-muted-foreground" strokeWidth={2} />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[16px] font-semibold">Two-factor authentication</h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {enabled
              ? "On. You'll be asked for a code from your authenticator when signing in."
              : "Off. Strongly recommended before connecting real bank accounts."}
          </p>
        </div>
      </div>

      {step === "idle" ? (
        <button
          type="button"
          onClick={() => setStep(enabled ? "password" : "password")}
          className="mt-4 inline-flex h-10 items-center rounded-[14px] border border-border px-4 text-[14px] font-medium"
        >
          {enabled ? "Turn off" : "Set up"}
        </button>
      ) : null}

      {step === "password" ? (
        <form onSubmit={enabled ? disable : startEnrolment} className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium">
              Confirm your password
            </span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              autoFocus
              className="h-11 w-full rounded-[14px] border border-input bg-background px-3.5 text-[15px] outline-none focus:border-ring"
            />
          </label>
          {error ? (
            <p role="alert" className="text-[13px] text-negative">
              {error}
            </p>
          ) : null}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setStep("idle");
                setError(null);
              }}
              className="h-11 flex-1 rounded-[14px] border border-border text-[15px] font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="h-11 flex-1 rounded-[14px] bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-60"
            >
              {busy ? "Working…" : "Continue"}
            </button>
          </div>
        </form>
      ) : null}

      {step === "verify" && uri ? (
        <div className="mt-4 space-y-4">
          <div>
            <p className="text-[13px] font-medium">1. Add this to your authenticator</p>
            <p className="mt-1 text-[12px] text-muted-foreground">
              Paste this setup key into 1Password, Authy, or Google Authenticator.
            </p>
            <code className="mt-2 block overflow-x-auto rounded-[12px] bg-secondary p-3 text-[11px] break-all">
              {uri}
            </code>
          </div>

          {backupCodes.length > 0 ? (
            <div>
              <p className="text-[13px] font-medium">2. Save your backup codes</p>
              <p className="mt-1 text-[12px] text-muted-foreground">
                Each works once. Without them, losing your phone means losing access.
              </p>
              <ul className="tabular mt-2 grid grid-cols-2 gap-1 rounded-[12px] bg-secondary p-3 text-[12px]">
                {backupCodes.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <form onSubmit={confirm} className="space-y-3">
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium">
                3. Enter the 6-digit code to confirm
              </span>
              <input
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                required
                autoFocus
                className="tabular h-11 w-full rounded-[14px] border border-input bg-background px-3.5 text-[18px] tracking-[0.3em] outline-none focus:border-ring"
              />
            </label>
            {error ? (
              <p role="alert" className="text-[13px] text-negative">
                {error}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={busy || code.length !== 6}
              className="h-11 w-full rounded-[14px] bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-50"
            >
              {busy ? "Verifying…" : "Turn on two-factor"}
            </button>
          </form>
        </div>
      ) : null}
    </section>
  );
}
