import { beforeEach, describe, expect, test, vi } from "vitest";
import { GET } from "./route";

const { mockFetchSessionCustomer, cookieJar } = vi.hoisted(() => {
  const store = new Map<string, string>();
  return {
    mockFetchSessionCustomer: vi.fn(),
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

vi.mock("@/lib/auth-server", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth-server")>("@/lib/auth-server");
  return {
    ...actual,
    fetchSessionCustomer: (...args: [string]) => mockFetchSessionCustomer(...args),
  };
});

describe("GET /api/auth/session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookieJar.clearAll();
  });

  test("no cookie -> { customer: null } without calling Medusa", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ customer: null });
    expect(mockFetchSessionCustomer).not.toHaveBeenCalled();
  });

  test("valid cookie -> resolves the customer via the token", async () => {
    cookieJar.set("session_token", "tok_valid");
    mockFetchSessionCustomer.mockResolvedValueOnce({ id: "cus_1", email: "shopper@example.com" });

    const response = await GET();

    expect(mockFetchSessionCustomer).toHaveBeenCalledWith("tok_valid");
    expect(await response.json()).toEqual({
      customer: { id: "cus_1", email: "shopper@example.com" },
    });
  });

  test("stale/invalid cookie -> { customer: null }, never throws", async () => {
    cookieJar.set("session_token", "tok_expired");
    mockFetchSessionCustomer.mockResolvedValueOnce(null);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ customer: null });
  });
});
