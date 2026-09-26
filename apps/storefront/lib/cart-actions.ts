"use server";

// The client-facing RPC boundary for cart.ts. Kept as a thin, separate
// "use server" file (rather than putting the directive on cart.ts itself)
// so lib/cart.test.ts can import getOrCreateCart/addLineItem directly and
// call them as plain async functions — Next's Server Action framework
// (action ids, request-bound cookie mutability) only needs to wrap the
// functions client components actually invoke through the network, not the
// ones a Vitest test calls in-process.
import { addLineItem, getOrCreateCart, type Cart } from "./cart";

export async function getCart() {
  return getOrCreateCart();
}

export type AddToCartResult = { ok: true; cart: Cart } | { ok: false; error: "invalid_quantity" | "out_of_stock" };

// The ONLY client-facing mutation action — deliberately NOT `addLineItem`
// re-exported with a client-supplied cartId. Every export of a "use server"
// file is a public POST endpoint that anyone can call directly (not just
// through this app's own UI), so accepting an arbitrary cart id here would
// let a caller mutate any cart, and it would bypass getOrCreateCart's
// completed-cart replacement (e.g. a cart id cached in a client's
// TanStack Query state, completed in another tab in the meantime, would
// fail with an unrelated Medusa error and never recover). Instead this
// always resolves the shopper's own cart from the httpOnly cookie itself.
//
// Returns a result value instead of throwing for the "out of stock" case:
// Next.js strips the message off any error thrown from a Server Action in
// a production build (replaced with a generic, digest-only message), so an
// expected, user-facing outcome has to travel back as data, not an
// exception — see Next's docs on error handling in Server Actions
// (https://nextjs.org/docs/app/getting-started/error-handling#handling-expected-errors).
// lib/cart.ts's own addLineItem keeps its throwing signature for
// server-side callers that already have a trusted cart id (e.g. Task 10's
// checkout page).
export async function addToCart(variantId: string, quantity: number): Promise<AddToCartResult> {
  if (!Number.isInteger(quantity) || quantity < 1) {
    return { ok: false, error: "invalid_quantity" };
  }

  const cart = await getOrCreateCart();

  try {
    const updatedCart = await addLineItem(cart.id, variantId, quantity);
    return { ok: true, cart: updatedCart };
  } catch (error) {
    if (error instanceof Error && /out of stock/i.test(error.message)) {
      return { ok: false, error: "out_of_stock" };
    }
    throw error;
  }
}
