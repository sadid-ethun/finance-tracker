"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";

import { signIn } from "@/lib/auth-client";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const { error: signInError } = await signIn.email({ email, password });

    if (signInError) {
      // Deliberately generic: never reveal whether the address exists.
      setError("That email or password isn't right.");
      setPending(false);
      return;
    }

    // Only same-origin paths, so a crafted ?next= cannot redirect off-site.
    const next = searchParams.get("next");
    const destination = next?.startsWith("/") && !next.startsWith("//") ? next : "/";

    router.push(destination);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="email" className="mb-1.5 block text-[13px] font-medium">
          Email
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          autoFocus
          className="h-11 w-full rounded-[14px] border border-input bg-card px-3.5 text-[15px] outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
        />
      </div>

      <div>
        <label
          htmlFor="password"
          className="mb-1.5 block text-[13px] font-medium"
        >
          Password
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          className="h-11 w-full rounded-[14px] border border-input bg-card px-3.5 text-[15px] outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
        />
      </div>

      {error ? (
        <p role="alert" className="text-[13px] text-negative">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-[14px] bg-primary text-[15px] font-semibold text-primary-foreground transition-opacity disabled:opacity-60"
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
