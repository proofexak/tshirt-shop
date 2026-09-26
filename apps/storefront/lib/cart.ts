import { cookies } from "next/headers";
import { FetchError } from "@medusajs/js-sdk";
import { medusa } from "./medusa-client";

// Derived from the SDK's own return type rather than importing
// @medusajs/types directly — see hooks/useProducts.ts's `Product` type for
// the same reasoning (that package isn't a direct dependency here).
export type Cart = Awaited<ReturnType<typeof medusa.store.cart.retrieve>>["cart"];

export const CART_COOKIE_NAME = "cart_id";

async function createCart(): Promise<Cart> {
  const { regions } = await medusa.store.region.list();
  const region = regions[0] as { id: string } | undefined;
  if (!region) {
    throw new Error("No region is configured on this Medusa store; cannot create a cart.");
  }

  const { cart } = await medusa.store.cart.create({ region_id: region.id });
  return cart;
}

// Reads the cart id cookie, fetches that cart, and — if there's no cookie,
// the cart no longer exists, or its order already completed — creates a new
// cart in the seeded region and overwrites the cookie. This can only mutate
// the cookie when called from a Server Action or Route Handler (Next throws
// if `cookies().set()` runs during a plain Server Component render), which
// is why every caller of this reaches it through lib/cart-actions.ts.
export async function getOrCreateCart(): Promise<Cart> {
  const cookieStore = await cookies();
  const existingCartId = cookieStore.get(CART_COOKIE_NAME)?.value;

  if (existingCartId) {
    try {
      const { cart } = await medusa.store.cart.retrieve(existingCartId);
      if (!cart.completed_at) {
        return cart;
      }
    } catch {
      // Cart no longer exists (e.g. deleted) — fall through and create one.
    }
  }

  const cart = await createCart();
  cookieStore.set(CART_COOKIE_NAME, cart.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
  });

  return cart;
}

// Medusa's own inventory-rejection error (confirmInventoryStep, thrown as a
// MedusaError with code "insufficient_inventory" and the message "Some
// variant does not have the required inventory") surfaces through the store
// API as a 400 whose message doesn't itself match the brief's
// /out of stock|insufficient inventory/i — so it's rethrown here with a
// message that does. Any other error (network failure, invalid cart id,
// etc.) passes through unchanged.
function isInsufficientInventoryError(error: unknown): boolean {
  return error instanceof FetchError && error.status === 400 && /inventory/i.test(error.message);
}

export async function addLineItem(
  cartId: string,
  variantId: string,
  quantity: number
): Promise<Cart> {
  try {
    const { cart } = await medusa.store.cart.createLineItem(cartId, {
      variant_id: variantId,
      quantity,
    });
    return cart;
  } catch (error) {
    if (isInsufficientInventoryError(error)) {
      throw new Error("This variant is out of stock.");
    }
    throw error;
  }
}
