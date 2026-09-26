"use server";

// The client-facing RPC boundary for cart.ts. Kept as a thin, separate
// "use server" file (rather than putting the directive on cart.ts itself)
// so lib/cart.test.ts can import getOrCreateCart/addLineItem directly and
// call them as plain async functions — Next's Server Action framework
// (action ids, request-bound cookie mutability) only needs to wrap the
// functions client components actually invoke through the network, not the
// ones a Vitest test calls in-process.
import { addLineItem as addLineItemToCart, getOrCreateCart } from "./cart";

export async function getCart() {
  return getOrCreateCart();
}

export async function addLineItem(cartId: string, variantId: string, quantity: number) {
  return addLineItemToCart(cartId, variantId, quantity);
}
