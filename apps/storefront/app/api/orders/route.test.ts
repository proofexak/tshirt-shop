import { beforeEach, describe, expect, test, vi } from "vitest";
import { GET } from "./route";

const { mockListCustomerOrders, cookieJar } = vi.hoisted(() => {
  const store = new Map<string, string>();
  return {
    mockListCustomerOrders: vi.fn(),
    cookieJar: {
      get(name: string) {
        return store.has(name) ? { name, value: store.get(name)! } : undefined;
      },
      set(name: string, value: string) {
        store.set(name, value);
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

vi.mock("@/lib/orders", async () => {
  const actual = await vi.importActual<typeof import("@/lib/orders")>("@/lib/orders");
  return {
    ...actual,
    listCustomerOrders: (...args: [string]) => mockListCustomerOrders(...args),
  };
});

describe("GET /api/orders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookieJar.clearAll();
  });

  test("no cookie -> { orders: [] } without calling the order lookup", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ orders: [] });
    expect(mockListCustomerOrders).not.toHaveBeenCalled();
  });

  test("valid cookie -> lists the customer's orders via the token", async () => {
    cookieJar.set("session_token", "tok_valid");
    mockListCustomerOrders.mockResolvedValueOnce([
      { id: "order_1", display_id: 7, currency_code: "eur", total: 25, created_at: "2026-09-20T00:00:00.000Z" },
    ]);

    const response = await GET();

    expect(mockListCustomerOrders).toHaveBeenCalledWith("tok_valid");
    expect(await response.json()).toEqual({
      orders: [{ id: "order_1", display_id: 7, currency_code: "eur", total: 25, created_at: "2026-09-20T00:00:00.000Z" }],
    });
  });
});
