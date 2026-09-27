"use client";

import { useQuery } from "@tanstack/react-query";
import type { OrderSummary } from "@/lib/orders";

// Talks only to the same-origin route handler (app/api/orders/route.ts) —
// never to Medusa directly and never holds the session token — mirroring
// lib/auth.ts's useSession() pattern. Used by the account page.
export function useOrders(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["orders"],
    queryFn: async (): Promise<OrderSummary[]> => {
      const response = await fetch("/api/orders");
      if (!response.ok) {
        return [];
      }
      const data = (await response.json()) as { orders: OrderSummary[] };
      return data.orders ?? [];
    },
    enabled: options?.enabled ?? true,
  });
}
