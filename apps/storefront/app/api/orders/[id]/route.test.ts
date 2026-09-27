import { beforeEach, describe, expect, test, vi } from "vitest";
import { GET } from "./route";

const { mockGetOrderForCustomer, cookieJar } = vi.hoisted(() => {
  const store = new Map<string, string>();
  return {
    mockGetOrderForCustomer: vi.fn(),
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
    getOrderForCustomer: (...args: [string, string]) => mockGetOrderForCustomer(...args),
  };
});

function makeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/orders/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookieJar.clearAll();
  });

  test("no cookie -> { order: null } without calling the order lookup", async () => {
    const response = await GET(new Request("http://localhost/api/orders/order_1"), makeContext("order_1"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ order: null });
    expect(mockGetOrderForCustomer).not.toHaveBeenCalled();
  });

  test("valid cookie -> resolves the order via the token, scoped to that order id", async () => {
    cookieJar.set("session_token", "tok_valid");
    mockGetOrderForCustomer.mockResolvedValueOnce({
      id: "order_1",
      display_id: 7,
      currency_code: "eur",
      total: 25,
      created_at: "2026-09-20T00:00:00.000Z",
      items: [],
    });

    const response = await GET(new Request("http://localhost/api/orders/order_1"), makeContext("order_1"));

    expect(mockGetOrderForCustomer).toHaveBeenCalledWith("order_1", "tok_valid");
    expect((await response.json()).order.display_id).toBe(7);
  });

  test("someone else's order (or a nonexistent/malformed id) -> { order: null }, never a crash or a different status", async () => {
    cookieJar.set("session_token", "tok_valid");
    mockGetOrderForCustomer.mockResolvedValueOnce(null);

    const response = await GET(new Request("http://localhost/api/orders/order_not_mine"), makeContext("order_not_mine"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ order: null });
  });
});
