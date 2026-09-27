"use client";

import { useQuery } from "@tanstack/react-query";
import { medusa } from "@/lib/medusa-client";
import type { Product } from "./useProducts";

// The store product API omits variant inventory and calculated prices unless
// explicitly requested, and `calculated_price` additionally needs a
// `region_id` in the query to resolve an amount (Task 6 ruling 6).
//
// Medusa's FieldParser treats ANY requested field lacking a `+`/`-`/`*`
// modifier as "discard every default field, use exactly what was asked" —
// project-wide, not just for that field's own relation (confirmed against
// the live dev DB; see Task 14's report). `thumbnail` below is one such bare
// field, so this list has to spell out every top-level and nested field this
// hook actually needs (handle, title, options.id/title, variants themselves)
// rather than relying on any of them still being there by default.
const PRODUCT_FIELDS = [
  "handle",
  "title",
  "thumbnail",
  "*images",
  "options.id",
  "options.title",
  "*options.values",
  "*variants",
  "+variants.inventory_quantity",
  "+variants.calculated_price",
  "*variants.options",
  "*variants.images",
].join(",");

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
