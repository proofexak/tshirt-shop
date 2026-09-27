import { FetchError } from "@medusajs/js-sdk";
import { medusa } from "./medusa-client";
import { fetchSessionCustomer } from "./auth-server";

// Derived from the SDK's own return types rather than importing
// @medusajs/types directly — same reasoning as lib/cart.ts's `Cart` type
// (that package isn't a direct dependency here).
type StoreOrder = Awaited<ReturnType<typeof medusa.store.order.retrieve>>["order"];
type StoreOrderLineItem = NonNullable<StoreOrder["items"]>[number];

export type OrderLineItem = {
  id: string;
  title: string;
  variant_title: string | null;
  quantity: number;
};

export type OrderDetail = {
  id: string;
  display_id: number;
  currency_code: string;
  total: number;
  created_at: string;
  items: OrderLineItem[];
};

export type OrderSummary = {
  id: string;
  display_id: number;
  currency_code: string;
  total: number;
  created_at: string;
};

function toLineItem(item: StoreOrderLineItem): OrderLineItem {
  return {
    id: item.id,
    title: item.title,
    variant_title: item.variant_title ?? null,
    quantity: item.quantity,
  };
}

function toOrderDetail(order: StoreOrder): OrderDetail {
  return {
    id: order.id,
    display_id: order.display_id ?? 0,
    currency_code: order.currency_code,
    total: order.total,
    created_at: String(order.created_at),
    items: (order.items ?? []).map(toLineItem),
  };
}

// GET /store/orders/:id needs fields explicitly requested beyond Medusa's
// own defaultStoreRetrieveOrderFields to get customer_id (used for the
// ownership check below — see getOrderForCustomer) and the line-item
// fields this page renders.
const ORDER_DETAIL_FIELDS =
  "id,display_id,currency_code,total,created_at,customer_id,*items,items.title,items.variant_title,items.quantity";

// A well-formed-but-nonexistent order id and a malformed/garbage string
// both surface from Medusa as a 404 (verified empirically against the live
// backend — both `GET /store/orders/not-a-real-id` and
// `GET /store/orders/order_01FAKE...` return
// `404 {"type":"not_found","message":"Order id not found: ..."}`, same
// pattern as lib/cart.ts's isCartNotFoundError) — never a crash, and
// importantly the SAME shape as "found, but not yours" below, so callers
// can't distinguish a nonexistent id from an inaccessible one.
//
// Deliberately NOT treating a 400 as not-found (round-1 review finding):
// an earlier version of this function also matched status 400, on the
// theory that a malformed id might be rejected before Medusa even looks it
// up. But a 400 here isn't caused by a bad id at all — Medusa's own
// framework code throws `MedusaError.Types.INVALID_DATA` (-> 400) from
// `validateRelationsLimit` when the requested `fields` exceed
// `storeRelationsLimit: 3` (see
// node_modules/@medusajs/framework/dist/http/utils/relations-limit.js and
// .../store/orders/query-config.js's `storeRelationsLimit: 3`), i.e. a bug
// in ORDER_DETAIL_FIELDS below, not a shopper-caused condition. Silently
// mapping that to "Order not found" would hide a real regression behind a
// misleading, shopper-facing message instead of surfacing it as an error.
function isOrderNotFoundError(error: unknown): boolean {
  return error instanceof FetchError && error.status === 404;
}

// Medusa's GET /store/orders/:id route is intentionally unauthenticated —
// see node_modules/@medusajs/medusa/dist/api/store/orders/[id]/route.js,
// which has no `authenticate` middleware at all (confirmed by reading
// .../store/orders/middlewares.js: only the plain-list route and the
// transfer routes get `authenticate("customer", ["session", "bearer"])`;
// the [id] GET route gets none) and carries this comment directly above the
// handler:
//
//   "This API route is intentionally unauthenticated as the order ID is a
//   UUID that requires brute forcing to gain access to. The order ID is
//   used as the authentication mechanism to ensure that only the customer
//   with the order ID can access the order details."
//
// In other words: Medusa's own design assumes the order id itself is the
// secret, and does NOT check that the caller owns the order — anyone who
// knows (or guesses) an order id can retrieve it, logged in or not. This
// storefront's ruling is stricter (checkout requires a logged-in customer,
// and the confirmation page must not show a stranger's order), so ownership
// has to be enforced here, in application code: resolve who's logged in
// from the session token, fetch the order, and only return it if its
// customer_id matches. A missing order, a malformed id, or someone else's
// order all resolve to `null` — deliberately indistinguishable from each
// other, so this never leaks whether an order id exists to someone who
// doesn't own it.
export async function getOrderForCustomer(orderId: string, token: string): Promise<OrderDetail | null> {
  const customer = await fetchSessionCustomer(token);
  if (!customer) {
    return null;
  }

  let order: StoreOrder;
  try {
    ({ order } = await medusa.store.order.retrieve(orderId, { fields: ORDER_DETAIL_FIELDS }));
  } catch (error) {
    if (isOrderNotFoundError(error)) {
      return null;
    }
    throw error;
  }

  if (order.customer_id !== customer.id) {
    return null;
  }

  return toOrderDetail(order);
}

const ORDER_LIST_FIELDS = "id,display_id,currency_code,total,created_at";

// Unlike the [id] route above, GET /store/orders IS authenticated
// (authenticate("customer", ["session", "bearer"]) — see
// .../store/orders/middlewares.js) and its handler filters server-side by
// `customer_id: req.auth_context.actor_id` derived from that same bearer
// token (see .../store/orders/route.js) — so, for the list route, passing
// the token is *sufficient* for correct scoping; no extra ownership check
// is needed here the way it is for getOrderForCustomer above.
export async function listCustomerOrders(token: string): Promise<OrderSummary[]> {
  const { orders } = await medusa.store.order.list(
    { limit: 100, fields: ORDER_LIST_FIELDS },
    { Authorization: `Bearer ${token}` }
  );

  return orders
    .map((order) => ({
      id: order.id,
      display_id: order.display_id ?? 0,
      currency_code: order.currency_code,
      total: order.total,
      created_at: String(order.created_at),
    }))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}
