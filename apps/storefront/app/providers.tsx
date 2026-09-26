"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export function Providers({ children }: { children: ReactNode }) {
  // One QueryClient per component instance (not module scope) so each
  // client/session gets its own cache — the standard TanStack Query +
  // Next.js App Router setup.
  const [queryClient] = useState(() => new QueryClient());

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
