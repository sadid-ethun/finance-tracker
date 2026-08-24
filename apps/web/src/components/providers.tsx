"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { ThemeProvider } from "next-themes";
import { useState } from "react";

import { makeQueryClient } from "@/lib/query";

export function Providers({ children }: { children: React.ReactNode }) {
  // Created in state so each browser session gets one client, and so a server
  // render never shares a cache between users.
  const [queryClient] = useState(makeQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      {/* Transaction filters live in the URL, so they stay shareable and
          back-button correct (PLAN.md section 14). */}
      {/* attribute="class" matches the `.dark` selector in globals.css. */}
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
        <NuqsAdapter>{children}</NuqsAdapter>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
