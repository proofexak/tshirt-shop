import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useOrder } from "./useOrder";
import type { OrderDetail } from "@/lib/orders";

// Round-1 review finding: useOrder() used to collapse ANY non-ok response
// (including a genuine 500) into `data: null`, which the order page then
// rendered as "Order not found" — indistinguishable from a real backend
// failure. It should throw instead, so TanStack Query's error state can
// carry that distinction through to the page.
describe("useOrder", () => {
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

  test("resolves the order on a 200 response", async () => {
    const order: OrderDetail = {
      id: "order_1",
      display_id: 7,
      currency_code: "eur",
      total: 25,
      created_at: "2026-09-20T00:00:00.000Z",
      items: [],
    };
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ order }), { status: 200 })
    );

    const { result } = renderHook(() => useOrder("order_1"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(order);
  });

  test("resolves null (not an error) when the route handler reports order: null", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ order: null }), { status: 200 })
    );

    const { result } = renderHook(() => useOrder("order_not_mine"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  test("enters the error state (does not resolve null) on a non-ok response", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(new Response("Internal error", { status: 500 }));

    const { result } = renderHook(() => useOrder("order_1"), { wrapper });

    // useOrder sets retry: 1 on the query itself (round-1 review ask —
    // "consider retry so a genuine outage doesn't hang on the default 3
    // retries"), which takes precedence over this test's QueryClient-level
    // `retry: false` default; the one retry's backoff delay means this
    // takes a bit over 1s, hence the longer timeout.
    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 3000 });
    expect(result.current.data).toBeUndefined();
  });
});
