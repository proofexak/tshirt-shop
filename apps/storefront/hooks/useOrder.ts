"use client";

import { useQuery } from "@tanstack/react-query";
import type { OrderDetail } from "@/lib/orders";

// Talks only to the same-origin route handler (app/api/orders/[id]/route.ts)
// — never to Medusa directly and never holds the session token — mirroring
// lib/auth.ts's useSession() pattern.
export function useOrder(orderId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["order", orderId],
    queryFn: async (): Promise<OrderDetail | null> => {
      const response = await fetch(`/api/orders/${orderId}`);
      if (!response.ok) {
        return null;
      }
      const data = (await response.json()) as { order: OrderDetail | null };
      return data.order ?? null;
    },
    enabled: options?.enabled ?? true,
  });
}
