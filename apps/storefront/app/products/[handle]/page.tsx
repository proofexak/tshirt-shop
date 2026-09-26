"use client";

import { Suspense, use, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useProduct } from "@/hooks/useProduct";
import { cartQueryKey } from "@/hooks/useCart";
import { addToCart } from "@/lib/cart-actions";
import { useUiStore } from "@/store/ui-store";
import { VariantPicker, type Variant } from "@/components/VariantPicker";

type AddToCartErrorCode = "out_of_stock" | "invalid_quantity";

// Maps addToCart's stable result codes to shopper-facing copy. Kept here
// (not in lib/cart-actions.ts) because a "use server" file may only export
// async functions — a plain lookup object can't live there.
const ADD_TO_CART_ERROR_MESSAGES: Record<AddToCartErrorCode, string> = {
  out_of_stock: "This variant is out of stock.",
  invalid_quantity: "Could not add this item to the cart.",
};

function ProductPageContent({ handle }: { handle: string }) {
  const { data: product, isLoading, isError } = useProduct(handle);
  const queryClient = useQueryClient();
  const openCartDrawer = useUiStore((state) => state.openCartDrawer);
  // Held here (not inside VariantPicker) so the "Add to cart" button on
  // this same page can read it and stay disabled until a size is picked.
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [addToCartError, setAddToCartError] = useState<string | null>(null);

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

  const handleAddToCart = async () => {
    if (!selectedVariantId) {
      return;
    }
    setAddToCartError(null);
    setIsAddingToCart(true);
    try {
      // addToCart resolves the shopper's own cart from the httpOnly cookie
      // itself — this page never needs to know the cart id (see
      // lib/cart-actions.ts).
      const result = await addToCart(selectedVariantId, 1);
      if (!result.ok) {
        setAddToCartError(ADD_TO_CART_ERROR_MESSAGES[result.error]);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: cartQueryKey });
      openCartDrawer();
    } catch (error) {
      // An unexpected failure (e.g. the action call itself couldn't reach
      // the server) — addToCart's own expected outcomes are result values,
      // not throws (see lib/cart-actions.ts).
      setAddToCartError(
        error instanceof Error ? error.message : "Could not add this item to the cart."
      );
    } finally {
      setIsAddingToCart(false);
    }
  };

  return (
    <main
      className="mx-auto max-w-2xl px-4 py-8"
      // Surfaces the held selection state (harmless, and lets e2e checks
      // confirm a size was actually picked).
      data-selected-variant-id={selectedVariantId ?? undefined}
    >
      <h1 className="mb-2 text-2xl font-semibold">{product.title}</h1>
      {formattedPrice && <p className="mb-6 text-lg">{formattedPrice}</p>}
      <VariantPicker variants={variants} onSelect={setSelectedVariantId} />
      <button
        type="button"
        disabled={!selectedVariantId || isAddingToCart}
        onClick={handleAddToCart}
        className="mt-4 rounded bg-black px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
      >
        Add to cart
      </button>
      {addToCartError && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {addToCartError}
        </p>
      )}
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
