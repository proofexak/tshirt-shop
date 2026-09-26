"use client";

import { useQuery } from "@tanstack/react-query";
import { medusa } from "@/lib/medusa-client";
import type { Product } from "./useProducts";

// The store product API omits variant inventory and calculated prices unless
// explicitly requested, and `calculated_price` additionally needs a
// `region_id` in the query to resolve an amount (Task 6 ruling 6).
const PRODUCT_FIELDS = "*variants,+variants.inventory_quantity,+variants.calculated_price";

export function useProduct(handle: string) {
  return useQuery({
    queryKey: ["product", handle],
    queryFn: async (): Promise<Product | null> => {
      const { regions } = await medusa.store.region.list();
      const region = regions[0] as { id: string } | undefined;

      const { products } = await medusa.store.product.list({
        handle,
        region_id: region?.id,
        fields: PRODUCT_FIELDS,
      });

      return products[0] ?? null;
    },
    enabled: handle.length > 0,
  });
}
