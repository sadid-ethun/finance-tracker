"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

import { makeQueryClient } from "@/lib/query";

export function Providers({ children }: { children: React.ReactNode }) {
  // Created in state so each browser session gets one client, and so a server
  // render never shares a cache between users.
  const [queryClient] = useState(makeQueryClient);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
