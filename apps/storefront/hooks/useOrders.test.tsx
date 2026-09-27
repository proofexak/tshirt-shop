import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useOrders } from "./useOrders";
import type { OrderSummary } from "@/lib/orders";

// Round-1 review finding: useOrders() used to collapse ANY non-ok response
// into `data: []`, which the account page then rendered as "You haven't
// placed any orders yet." — indistinguishable from a genuine backend
// failure. It should throw instead.
describe("useOrders", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function wrapper({ children }: { children: ReactNode }) {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  test("resolves the orders list on a 200 response", async () => {
    const orders: OrderSummary[] = [
      { id: "order_1", display_id: 7, currency_code: "eur", total: 25, created_at: "2026-09-20T00:00:00.000Z" },
    ];
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ orders }), { status: 200 })
    );

    const { result } = renderHook(() => useOrders(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(orders);
  });

  test("resolves an empty list (not an error) when the route handler reports no orders", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ orders: [] }), { status: 200 })
    );

    const { result } = renderHook(() => useOrders(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  test("enters the error state (does not resolve []) on a non-ok response", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(new Response("Internal error", { status: 500 }));

    const { result } = renderHook(() => useOrders(), { wrapper });

    // See useOrder.test.tsx's equivalent test for why this needs a longer
    // timeout (useOrders sets retry: 1 on the query itself).
    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 3000 });
    expect(result.current.data).toBeUndefined();
  });
});
