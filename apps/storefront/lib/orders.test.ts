// Unit-level, mocked Medusa client + auth-server (unlike lib/cart.test.ts /
// lib/auth-server.test.ts, which run against the live backend). Deliberate
// choice here: proving getOrderForCustomer's ownership check and
// not-found mapping doesn't need a real order, and doing it against the
// live backend the way cart.test.ts does would consume real stock on every
// run without the same caching mechanism cart.test.ts had to add (Task 7
// review round 1, finding 4) — disproportionate to this task's scope. The
// two things that specifically need the *real* backend (Medusa's
// /store/orders/:id being unauthenticated, and /store/orders being
// authenticated + customer-filtered) were verified by reading Medusa's own
// route source (see lib/orders.ts's comments) and by manual live
// verification (see task-11-report.md), not by this file.
import { beforeEach, describe, expect, test, vi } from "vitest";
import { FetchError } from "@medusajs/js-sdk";

const { mockRetrieve, mockList, mockFetchSessionCustomer } = vi.hoisted(() => ({
  mockRetrieve: vi.fn(),
  mockList: vi.fn(),
  mockFetchSessionCustomer: vi.fn(),
}));

vi.mock("./medusa-client", () => ({
  medusa: {
    store: {
      order: {
        retrieve: (...args: unknown[]) => mockRetrieve(...args),
        list: (...args: unknown[]) => mockList(...args),
      },
    },
  },
}));

vi.mock("./auth-server", () => ({
  fetchSessionCustomer: (...args: unknown[]) => mockFetchSessionCustomer(...args),
}));

const { getOrderForCustomer, listCustomerOrders } = await import("./orders");

const CUSTOMER_A = { id: "cus_a", email: "a@example.com" };
const CUSTOMER_B = { id: "cus_b", email: "b@example.com" };

function fakeOrder(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "order_1",
    display_id: 42,
    currency_code: "eur",
    total: 25,
    created_at: "2026-09-20T12:00:00.000Z",
    customer_id: CUSTOMER_A.id,
    items: [{ id: "item_1", title: "Classic Crew Tee", variant_title: "M", quantity: 1 }],
    ...overrides,
  };
}

describe("getOrderForCustomer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("returns the order when it belongs to the logged-in customer", async () => {
    mockFetchSessionCustomer.mockResolvedValueOnce(CUSTOMER_A);
    mockRetrieve.mockResolvedValueOnce({ order: fakeOrder() });

    const result = await getOrderForCustomer("order_1", "tok_a");

    expect(result).toEqual({
      id: "order_1",
      display_id: 42,
      currency_code: "eur",
      total: 25,
      created_at: "2026-09-20T12:00:00.000Z",
      items: [{ id: "item_1", title: "Classic Crew Tee", variant_title: "M", quantity: 1 }],
    });
  });

  // The security-critical case: Medusa's own GET /store/orders/:id route
  // does NOT check ownership (see lib/orders.ts's comment, sourced from
  // Medusa's own route.js), so this app-level check is the only thing
  // standing between one customer and another's order.
  test("returns null when the order belongs to a different customer", async () => {
    mockFetchSessionCustomer.mockResolvedValueOnce(CUSTOMER_B);
    mockRetrieve.mockResolvedValueOnce({ order: fakeOrder({ customer_id: CUSTOMER_A.id }) });

    const result = await getOrderForCustomer("order_1", "tok_b");

    expect(result).toBeNull();
  });

  test("returns null (not a crash) for a nonexistent/malformed order id", async () => {
    mockFetchSessionCustomer.mockResolvedValueOnce(CUSTOMER_A);
    mockRetrieve.mockRejectedValueOnce(new FetchError("Not found", "Not Found", 404));

    const result = await getOrderForCustomer("garbage-id", "tok_a");

    expect(result).toBeNull();
  });

  test("returns null when there is no valid session (no token, or an expired one)", async () => {
    mockFetchSessionCustomer.mockResolvedValueOnce(null);

    const result = await getOrderForCustomer("order_1", "tok_expired");

    expect(result).toBeNull();
    // Never even looks the order up without a resolvable customer.
    expect(mockRetrieve).not.toHaveBeenCalled();
  });

  test("rethrows an unexpected (non-404/400) error instead of treating it as not-found", async () => {
    mockFetchSessionCustomer.mockResolvedValueOnce(CUSTOMER_A);
    mockRetrieve.mockRejectedValueOnce(new FetchError("Service unavailable", "Internal Server Error", 500));

    await expect(getOrderForCustomer("order_1", "tok_a")).rejects.toThrow("Service unavailable");
  });
});

describe("listCustomerOrders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("passes the token as a bearer header and returns orders newest first", async () => {
    mockList.mockResolvedValueOnce({
      orders: [
        { id: "order_old", display_id: 1, currency_code: "eur", total: 10, created_at: "2026-09-01T00:00:00.000Z" },
        { id: "order_new", display_id: 2, currency_code: "eur", total: 20, created_at: "2026-09-15T00:00:00.000Z" },
      ],
    });

    const result = await listCustomerOrders("tok_a");

    expect(mockList).toHaveBeenCalledWith(expect.anything(), { Authorization: "Bearer tok_a" });
    expect(result.map((order) => order.id)).toEqual(["order_new", "order_old"]);
  });
});
