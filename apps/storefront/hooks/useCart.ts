"use client";

import { useQuery } from "@tanstack/react-query";
import { getCart } from "@/lib/cart-actions";

// Shared by the product page (for the current cart id), CartIcon (item
// count), and CartDrawer (line items) — invalidating this one key after a
// successful add-to-cart keeps all three in sync (Task 7 ruling 5).
export const cartQueryKey = ["cart"] as const;

export function useCart() {
  return useQuery({
    queryKey: cartQueryKey,
    queryFn: () => getCart(),
  });
}
