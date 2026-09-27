"use client";

import { useQuery } from "@tanstack/react-query";
import type { OrderDetail } from "@/lib/orders";

// Talks only to the same-origin route handler (app/api/orders/[id]/route.ts)
// — never to Medusa directly and never holds the session token — mirroring
// lib/auth.ts's useSession() pattern.
//
// The route handler already returns 200 with `{ order: null }` for every
// "can't show this" case that's safe to render as "not found" (no session,
// order doesn't exist, malformed id, someone else's order — see
// lib/orders.ts's getOrderForCustomer). So a non-2xx response here means
// something else went wrong server-side (round-1 review finding: this used
// to collapse a genuine 500 into `null` too, which the page then rendered
// as "Order not found" — indistinguishable from a real backend failure).
// Throwing instead lets TanStack Query's error state carry that
// distinction through to the page. `retry: 1` (not the default 3) so a
// real outage surfaces reasonably quickly instead of quietly retrying for
// several seconds first.
export function useOrder(orderId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["order", orderId],
    queryFn: async (): Promise<OrderDetail | null> => {
      const response = await fetch(`/api/orders/${orderId}`);
      if (!response.ok) {
        throw new Error(`Failed to load order ${orderId} (status ${response.status})`);
      }
      const data = (await response.json()) as { order: OrderDetail | null };
      return data.order ?? null;
    },
    enabled: options?.enabled ?? true,
    retry: 1,
  });
}
