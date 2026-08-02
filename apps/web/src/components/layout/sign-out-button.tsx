"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut } from "lucide-react";

import { signOut } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleSignOut() {
    setPending(true);
    await signOut();
    // refresh() clears cached server-rendered content for the signed-in user.
    router.refresh();
    router.push("/login");
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={pending}
      className="flex w-full items-center gap-3 rounded-[14px] px-3 py-2.5 text-[15px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-60"
    >
      <LogOut className="size-[18px]" strokeWidth={2} />
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
