"use client";

import { useQuery } from "@tanstack/react-query";
import type { OrderSummary } from "@/lib/orders";

// Talks only to the same-origin route handler (app/api/orders/route.ts) —
// never to Medusa directly and never holds the session token — mirroring
// lib/auth.ts's useSession() pattern. Used by the account page.
//
// Same reasoning as useOrder.ts: the route handler already returns 200
// with `{ orders: [] }` for "no session" (which the page never even shows,
// since it redirects first), so a non-2xx response here is a genuine
// server-side failure, not "no orders yet" — throwing (round-1 review
// finding) instead of silently returning `[]` lets the page tell the two
// apart via TanStack Query's error state. `retry: 1`, not the default 3.
export function useOrders(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["orders"],
    queryFn: async (): Promise<OrderSummary[]> => {
      const response = await fetch("/api/orders");
      if (!response.ok) {
        throw new Error(`Failed to load orders (status ${response.status})`);
      }
      const data = (await response.json()) as { orders: OrderSummary[] };
      return data.orders ?? [];
    },
    enabled: options?.enabled ?? true,
    retry: 1,
  });
}
