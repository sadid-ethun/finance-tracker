import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { BottomTabs } from "@/components/layout/bottom-tabs";
import { Sidebar } from "@/components/layout/sidebar";
import { Providers } from "@/components/providers";
import { auth } from "@/lib/auth";

/**
 * Authenticated shell: sidebar on desktop, bottom tabs on mobile.
 *
 * The session is validated here rather than trusted from proxy.ts, so a forged
 * cookie cannot render the shell. Data itself is still guarded by the API.
 */

// Every page under this layout is per-user and must never be prerendered or
// cached at build time.
export const dynamic = "force-dynamic";
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect("/login");
  }

  return (
    <Providers>
      <div className="flex min-h-full flex-col">
        <Sidebar userName={session.user.name || session.user.email} />

        <div className="flex flex-1 flex-col lg:pl-60">
          {/* Bottom tab bar is 64px plus the iOS home indicator. */}
          <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 pt-6 pb-[calc(env(safe-area-inset-bottom)+80px)] lg:px-8 lg:pb-10">
            {children}
          </main>
        </div>

        <BottomTabs />
      </div>
    </Providers>
  );
}
