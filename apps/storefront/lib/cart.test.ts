// This suite runs against the LIVE local Medusa backend (seeded dev DB) —
// the out-of-stock rejection has to come from Medusa's own inventory check,
// which a mocked Medusa client can't prove. Only the cookie store
// (next/headers) is mocked. See ./test-support/live-backend-env.ts for why
// this import must come first, and CLAUDE.md / the task-7 brief's rulings
// for the rest of the reasoning.
import "./test-support/live-backend-env";

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FetchError } from "@medusajs/js-sdk";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { medusa } from "./medusa-client";
import { CART_COOKIE_NAME, addLineItem, getOrCreateCart } from "./cart";

const BACKEND_URL = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ?? "http://localhost:9000";

// A tiny in-memory fake for next/headers' cookies() store. vi.mock's factory
// is hoisted above imports, so the fake has to be created through
// vi.hoisted() to be available inside it.
const { cookieJar } = vi.hoisted(() => {
  const store = new Map<string, string>();
  return {
    cookieJar: {
      get(name: string) {
        return store.has(name) ? { name, value: store.get(name)! } : undefined;
      },
      set(name: string, value: string) {
        store.set(name, value);
      },
      delete(name: string) {
        store.delete(name);
      },
      clearAll() {
        store.clear();
      },
    },
  };
});

vi.mock("next/headers", () => ({
  cookies: async () => cookieJar,
}));

function mockCartCookie(cartId: string) {
  cookieJar.set(CART_COOKIE_NAME, cartId);
}

async function getVariantId(handle: string, size: string): Promise<string> {
  const { regions } = await medusa.store.region.list();
  const region = regions[0] as { id: string } | undefined;
  const { products } = await medusa.store.product.list({
    handle,
    region_id: region?.id,
    fields: "*variants",
  });
  const variant = products[0]?.variants?.find((v) => v.title === size);
  if (!variant) {
    throw new Error(
      `Fixture variant not found: ${handle} / ${size}. Is the dev DB seeded (pnpm --filter backend seed)?`
    );
  }
  return variant.id;
}

// Creates a real, completed order against the live backend so
// getOrCreateCart() has a genuinely-completed cart to replace. Uses
// classic-crew-tee/L (seeded with 10 units) rather than any variant another
// test in this file depends on staying in stock.
async function createAndCompleteTestCart(): Promise<{ id: string }> {
  const { regions } = await medusa.store.region.list();
  const region = regions[0] as { id: string; currency_code: string } | undefined;
  if (!region) {
    throw new Error("No region seeded on the backend.");
  }

  const { cart: created } = await medusa.store.cart.create({ region_id: region.id });

  const variantId = await getVariantId("classic-crew-tee", "L");
  await medusa.store.cart.createLineItem(created.id, {
    variant_id: variantId,
    quantity: 1,
  });

  await medusa.store.cart.update(created.id, {
    email: "cart-test@example.com",
    shipping_address: {
      first_name: "Test",
      last_name: "Buyer",
      address_1: "123 Test Street",
      city: "Berlin",
      country_code: "de",
      postal_code: "10115",
    },
  });

  const { shipping_options } = await medusa.store.fulfillment.listCartOptions({
    cart_id: created.id,
  });
  const shippingOption = shipping_options[0];
  if (!shippingOption) {
    throw new Error("No shipping options available for the test cart's address.");
  }

  const { cart: cartWithShipping } = await medusa.store.cart.addShippingMethod(created.id, {
    option_id: shippingOption.id,
  });

  await medusa.store.payment.initiatePaymentSession(cartWithShipping, {
    provider_id: "pp_system_default",
  });

  const result = await medusa.store.cart.complete(created.id);
  if (result.type !== "order") {
    throw new Error(
      `Failed to complete the test cart: ${result.error?.message ?? "unknown error"}`
    );
  }

  return { id: created.id };
}

// createAndCompleteTestCart() completes a REAL order, which permanently
// reserves 1 unit of classic-crew-tee/L (Medusa never auto-releases a
// completed order's inventory reservation) — seeded at 10, so running the
// suite ~10 times would exhaust it and start failing every later task's
// full-suite run with an unrelated "insufficient inventory" error, with no
// way to recover short of manually reseeding the dev DB.
//
// Fix: cache the completed cart's id on disk (scoped to this machine, via
// os.tmpdir() — never committed) and reuse it across test runs. The FIRST
// run ever (or the first run after a fresh clone / DB reset) consumes
// exactly one unit, same as before; every run after that consumes zero,
// because "a cart whose order already completed" doesn't stop being true
// once true — completed_at is immutable. If the cached id no longer
// resolves (e.g. the dev DB was reset), this falls back to creating a fresh
// one and re-caching it — self-healing, no manual reseeding ever required.
//
// (Considered instead: releasing the reservation right after each test run,
// via @medusajs/core-flows' deleteReservationsWorkflow. That needs a
// MedusaContainer, which only exists inside the backend process — reachable
// from here only by shelling out to `medusa exec` as a subprocess, which
// boots a whole second Medusa instance against the same DB on every test
// run. That's slower, adds a dependency on the backend package's CLI being
// on PATH, and risks contention with the dev server already running against
// the same DB. Caching one already-completed cart avoids all of that.)
const COMPLETED_CART_CACHE_PATH = join(
  tmpdir(),
  "tshirt-shop-storefront-cart-test-completed-cart.json"
);

function readCachedCompletedCartId(): string | null {
  try {
    if (!existsSync(COMPLETED_CART_CACHE_PATH)) {
      return null;
    }
    const data = JSON.parse(readFileSync(COMPLETED_CART_CACHE_PATH, "utf-8"));
    return typeof data.completedCartId === "string" ? data.completedCartId : null;
  } catch {
    return null;
  }
}

function writeCachedCompletedCartId(cartId: string): void {
  try {
    writeFileSync(COMPLETED_CART_CACHE_PATH, JSON.stringify({ completedCartId: cartId }));
  } catch {
    // Best-effort — if this fails, the next run just completes (and
    // consumes stock for) another test cart, which is still correct, just
    // not free.
  }
}

async function getOrCreateCompletedTestCart(): Promise<{ id: string }> {
  const cachedId = readCachedCompletedCartId();
  if (cachedId) {
    try {
      const { cart } = await medusa.store.cart.retrieve(cachedId);
      if (cart.completed_at) {
        return { id: cachedId };
      }
    } catch {
      // Cached id no longer resolves (e.g. the dev DB was reset since the
      // cache was written) — fall through and create + complete a fresh
      // one below.
    }
  }

  const fresh = await createAndCompleteTestCart();
  writeCachedCompletedCartId(fresh.id);
  return fresh;
}

beforeAll(async () => {
  try {
    const response = await fetch(`${BACKEND_URL}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) {
      throw new Error(`responded with status ${response.status}`);
    }
  } catch (error) {
    throw new Error(
      `cart.test.ts needs the local Medusa backend running at ${BACKEND_URL} (start it with ` +
        `\`pnpm --filter backend dev\` and make sure the dev DB is seeded) — ${
          error instanceof Error ? error.message : String(error)
        }`
    );
  }
}, 10000);

beforeEach(() => {
  cookieJar.clearAll();
});

describe("addLineItem", () => {
  test("rejects an out-of-stock variant", async () => {
    const hoodieSizeSVariantId = await getVariantId("basic-hoodie", "S");
    const cart = await getOrCreateCart();

    await expect(addLineItem(cart.id, hoodieSizeSVariantId, 1)).rejects.toThrow(
      /out of stock|insufficient inventory/i
    );
  });
});

describe("getOrCreateCart", () => {
  test("creates a new cart and sets the cart cookie", async () => {
    const cart = await getOrCreateCart();

    expect(cart.id).toMatch(/^cart_/);
    expect(cookieJar.get(CART_COOKIE_NAME)?.value).toBe(cart.id);
  });

  test("reuses an existing, incomplete cart from the cookie", async () => {
    const first = await getOrCreateCart();
    mockCartCookie(first.id);

    const second = await getOrCreateCart();

    expect(second.id).toBe(first.id);
  });

  test("replaces a cart whose order already completed", async () => {
    const completedCart = await getOrCreateCompletedTestCart();
    mockCartCookie(completedCart.id);

    const cart = await getOrCreateCart();

    expect(cart.id).not.toBe(completedCart.id);
    expect(cart.completed_at).toBeFalsy();
  }, 30000);

  test("creates a new cart when the cookie holds a nonexistent/garbage cart id", async () => {
    mockCartCookie("cart_this_id_does_not_exist_garbage");

    const cart = await getOrCreateCart();

    expect(cart.id).toMatch(/^cart_/);
    expect(cart.id).not.toBe("cart_this_id_does_not_exist_garbage");
  });

  test("rethrows an unexpected error instead of silently discarding the shopper's cart", async () => {
    const first = await getOrCreateCart();
    mockCartCookie(first.id);
    const retrieveSpy = vi
      .spyOn(medusa.store.cart, "retrieve")
      .mockRejectedValueOnce(new FetchError("Service unavailable", "Internal Server Error", 500));

    await expect(getOrCreateCart()).rejects.toThrow("Service unavailable");

    retrieveSpy.mockRestore();
  });
});
