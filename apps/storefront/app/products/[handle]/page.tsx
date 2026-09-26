"use client";

import { Suspense, use, useState } from "react";
import { useProduct } from "@/hooks/useProduct";
import { VariantPicker, type Variant } from "@/components/VariantPicker";

function ProductPageContent({ handle }: { handle: string }) {
  const { data: product, isLoading, isError } = useProduct(handle);
  // Held here (not inside VariantPicker) so a later "Add to cart" button on
  // this same page can read it and stay disabled until a size is picked.
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        <p>Loading…</p>
      </main>
    );
  }

  if (isError || !product) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        <p>Sorry, we couldn&apos;t find that product.</p>
      </main>
    );
  }

  const variants: Variant[] = (product.variants ?? []).map((variant) => ({
    id: variant.id,
    title: variant.title ?? "",
    inventory_quantity: variant.inventory_quantity,
  }));

  const price = product.variants?.[0]?.calculated_price;
  const formattedPrice =
    price?.calculated_amount != null && price.currency_code
      ? new Intl.NumberFormat("en", {
          style: "currency",
          currency: price.currency_code,
        }).format(price.calculated_amount)
      : null;

  return (
    <main
      className="mx-auto max-w-2xl px-4 py-8"
      // Surfaces the held selection state (harmless, and lets Task 7 /
      // e2e checks confirm a size was actually picked) until Task 7 adds
      // the real "Add to cart" button that reads selectedVariantId.
      data-selected-variant-id={selectedVariantId ?? undefined}
    >
      <h1 className="mb-2 text-2xl font-semibold">{product.title}</h1>
      {formattedPrice && <p className="mb-6 text-lg">{formattedPrice}</p>}
      <VariantPicker variants={variants} onSelect={setSelectedVariantId} />
      {/* Task 7 adds an "Add to cart" button here, enabled once
          selectedVariantId is non-null. */}
    </main>
  );
}

// `use(params)` suspends the component until the promise settles, so the
// Suspense boundary must be an ancestor of whatever calls it — this small
// wrapper exists only to sit between ProductPage's own Suspense and the
// `use()` call.
function ProductPageParams({
  params,
  children,
}: {
  params: Promise<{ handle: string }>;
  children: (handle: string) => React.ReactNode;
}) {
  const { handle } = use(params);
  return children(handle);
}

// Next 16: `params` is a Promise. This page is a Client Component (ruling 2:
// client-side reads via TanStack Query), so it unwraps `params` with React's
// `use()` rather than `await` (which only works in async Server Components).
// `use()` can suspend on first render, hence the Suspense boundary below —
// it's part of this component so callers (including a Vitest render of
// `<ProductPage params={Promise.resolve({ handle: "..." })} />`) don't need
// to supply one themselves.
export default function ProductPage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-2xl px-4 py-8">
          <p>Loading…</p>
        </main>
      }
    >
      <ProductPageParams params={params}>
        {(handle) => <ProductPageContent handle={handle} />}
      </ProductPageParams>
    </Suspense>
  );
}
