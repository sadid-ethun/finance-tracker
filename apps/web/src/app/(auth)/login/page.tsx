import { Suspense } from "react";
import type { Metadata } from "next";

import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Sign in · Finance Tracker",
};

export default function LoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-5 py-12">
      <div className="mb-8">
        <h1 className="text-[28px] font-semibold tracking-[-0.02em]">
          Welcome back
        </h1>
        <p className="mt-1.5 text-[15px] text-muted-foreground">
          Sign in to your finances.
        </p>
      </div>

      {/* useSearchParams needs a Suspense boundary during prerender. */}
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
