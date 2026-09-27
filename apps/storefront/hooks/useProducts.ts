"use client";

import { useQuery } from "@tanstack/react-query";
import { medusa } from "@/lib/medusa-client";

// Derived from the SDK's own return type rather than importing @medusajs/types
// directly — that package isn't a direct dependency of apps/storefront (pnpm's
// strict node_modules only expose what's declared in package.json), and this
// keeps the hook fully typed without adding it just for a type import.
export type Product = Awaited<ReturnType<typeof medusa.store.product.list>>["products"][number];

// Catalog listing needs the thumbnail for each card in addition to title +
// handle. `thumbnail` is a bare field (no `+`/`*` modifier), which per
// Medusa's FieldParser discards every other default field project-wide (see
// useProduct.ts's comment / Task 14's report) — so `handle`/`title` have to
// be requested explicitly here too, even though they're normally-default
// fields, to keep working once `thumbnail` is added.
const PRODUCTS_FIELDS = "handle,title,thumbnail";

export function useProducts() {
  return useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { products } = await medusa.store.product.list({ fields: PRODUCTS_FIELDS });
      return products;
    },
  });
}
