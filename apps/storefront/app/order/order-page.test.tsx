import { beforeEach, describe, expect, test, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import OrderPage from "./[id]/page";
import type { OrderDetail } from "@/lib/orders";

const { mockUseOrder, mockUseSession, mockReplace } = vi.hoisted(() => ({
  mockUseOrder: vi.fn(),
  mockUseSession: vi.fn(),
  mockReplace: vi.fn(),
}));

vi.mock("@/hooks/useOrder", () => ({
  useOrder: (...args: unknown[]) => mockUseOrder(...args),
}));

// The page also needs to know whether the visitor is logged in (controller
// ruling 1: no session -> redirect to /login?next=<path>) — useSession is
// Task 8's real client-side session hook, mocked here the same way
// AuthLinks.test.tsx and other consumers mock it.
vi.mock("@/lib/auth", () => ({
  useSession: () => mockUseSession(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

const testOrder: OrderDetail = {
  id: "order_01TESTORDER",
  display_id: 42,
  currency_code: "eur",
  total: 25,
  created_at: "2026-09-20T12:00:00.000Z",
  items: [
    { id: "item_1", title: "Classic Crew Tee", variant_title: "M", quantity: 2 },
    { id: "item_2", title: "Basic Hoodie", variant_title: "L", quantity: 1 },
  ],
};

// The brief's mockOrder(testOrder) — mocks this page's server boundary
// (useOrder, which itself only talks to app/api/orders/[id]/route.ts; see
// that hook and route handler for the real Medusa-backed logic, exercised
// separately in lib/orders.test.ts and app/api/orders/[id]/route.test.ts).
function mockOrder(order: OrderDetail | null) {
  mockUseOrder.mockReturnValue({ data: order, isLoading: false });
}

// React 19's use(params) suspends once even for an already-resolved
// promise; its own retry-on-settle doesn't reliably repaint in this jsdom +
// @testing-library/react environment (same gap documented in
// app/products/product-page-cart.test.tsx). Forcing one more render with
// the *same* params promise once it has settled works around it without
// changing the prescribed render call.
async function renderOrderPage(id: string) {
  const queryClient = new QueryClient();
  const params = Promise.resolve({ id });
  const ui = (
    <QueryClientProvider client={queryClient}>
      <OrderPage params={params} />
    </QueryClientProvider>
  );

  let utils!: ReturnType<typeof render>;
  await act(async () => {
    utils = render(ui);
    await params;
  });
  utils.rerender(ui);

  return utils;
}

describe("order confirmation page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSession.mockReturnValue({ data: { id: "cus_1", email: "shopper@example.com" }, isLoading: false });
  });

  test("order confirmation page shows the order's line items and total", async () => {
    mockOrder(testOrder);
    await renderOrderPage(testOrder.id);

    expect(await screen.findByText(String(testOrder.display_id))).toBeVisible();
    expect(screen.getByText("Classic Crew Tee")).toBeVisible();
    expect(screen.getByText("Basic Hoodie")).toBeVisible();
    expect(screen.getByText(/€25\.00/)).toBeVisible();
  });

  test("shows a heading confirming the order (matches Task 12's /order confirmed/i)", async () => {
    mockOrder(testOrder);
    await renderOrderPage(testOrder.id);

    expect(await screen.findByRole("heading", { name: /order confirmed/i })).toBeVisible();
  });

  test("renders a not-found message for an order that doesn't exist or isn't the customer's", async () => {
    mockOrder(null);
    await renderOrderPage("order_someone_elses");

    expect(await screen.findByText(/couldn.t find that order/i)).toBeVisible();
    expect(screen.queryByRole("heading", { name: /order confirmed/i })).not.toBeInTheDocument();
  });

  test("redirects to /login with next set when there is no session", async () => {
    mockUseSession.mockReturnValue({ data: null, isLoading: false });
    mockOrder(testOrder);

    await renderOrderPage(testOrder.id);

    expect(mockReplace).toHaveBeenCalledWith(`/login?next=/order/${testOrder.id}`);
    expect(screen.queryByRole("heading", { name: /order confirmed/i })).not.toBeInTheDocument();
  });
});
