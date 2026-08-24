"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { ShieldCheck, ShieldAlert } from "lucide-react";

import { Card } from "@/components/shared/card";
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
  // Kept with the URI it was generated from, so a stale QR from a previous
  // enrolment attempt can never be shown for a new secret.
  const [qr, setQr] = useState<{ forUri: string; dataUrl: string } | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);

  // Duo's manual path wants the base32 secret alone, not the otpauth:// URI.
  const manualKey = uri
    ? new URLSearchParams(uri.split("?")[1] ?? "").get("secret")
    : null;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!uri) return;
    let cancelled = false;
    // Rendered client-side so the secret never travels to a QR service.
    QRCode.toDataURL(uri, { width: 220, margin: 1 })
      .then((dataUrl) => {
        if (!cancelled) setQr({ forUri: uri, dataUrl });
      })
      .catch(() => {
        // Fall through to the manual key; no state reset needed because the
        // render guard below only trusts a QR matching the current URI.
      });
    return () => {
      cancelled = true;
    };
  }, [uri]);

  const qrSrc = qr && qr.forUri === uri ? qr.dataUrl : null;

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
    <Card as="section" className="p-5">
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
            <p className="text-[13px] font-medium">1. Scan this with your authenticator</p>
            <p className="mt-1 text-[12px] text-muted-foreground">
              Works with Duo Mobile, 1Password, Authy, and Google Authenticator.
              In Duo, choose Add → Third-party account → Use QR code.
            </p>

            {qrSrc ? (
              // White plate: a QR inverted by dark mode will not scan.
              <div className="mt-3 flex justify-center rounded-[12px] bg-white p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrSrc} alt="Two-factor setup QR code" width={220} height={220} />
              </div>
            ) : null}

            <details className="mt-3">
              <summary className="cursor-pointer text-[12px] text-muted-foreground">
                Can&apos;t scan? Enter the key by hand
              </summary>
              <p className="mt-2 text-[12px] text-muted-foreground">
                Type this key into your authenticator. It is the secret on its
                own — not the whole link, which Duo will reject.
              </p>
              <code className="tabular mt-2 block overflow-x-auto rounded-[12px] bg-secondary p-3 text-[12px] break-all">
                {manualKey ?? uri}
              </code>
            </details>
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
    </Card>
  );
}
