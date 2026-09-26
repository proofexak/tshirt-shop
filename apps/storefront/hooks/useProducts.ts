"use client";

import { useQuery } from "@tanstack/react-query";
import { medusa } from "@/lib/medusa-client";

// Derived from the SDK's own return type rather than importing @medusajs/types
// directly — that package isn't a direct dependency of apps/storefront (pnpm's
// strict node_modules only expose what's declared in package.json), and this
// keeps the hook fully typed without adding it just for a type import.
export type Product = Awaited<ReturnType<typeof medusa.store.product.list>>["products"][number];

// Catalog listing only needs title + handle (both in the default field set),
// so no `fields` override here — see useProduct.ts for the detail page's
// richer query (variants, inventory, price).
export function useProducts() {
  return useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { products } = await medusa.store.product.list();
      return products;
    },
  });
}
