import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AccountPage from "./page";
import type { OrderSummary } from "@/lib/orders";

const { mockUseOrders, mockUseSession, mockReplace } = vi.hoisted(() => ({
  mockUseOrders: vi.fn(),
  mockUseSession: vi.fn(),
  mockReplace: vi.fn(),
}));

vi.mock("@/hooks/useOrders", () => ({
  useOrders: (...args: unknown[]) => mockUseOrders(...args),
}));

vi.mock("@/lib/auth", () => ({
  useSession: () => mockUseSession(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

const testOrders: OrderSummary[] = [
  { id: "order_1", display_id: 10, currency_code: "eur", total: 25, created_at: "2026-09-10T12:00:00.000Z" },
  { id: "order_2", display_id: 11, currency_code: "eur", total: 40, created_at: "2026-09-20T12:00:00.000Z" },
];

function renderAccountPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <AccountPage />
    </QueryClientProvider>
  );
}

describe("account page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSession.mockReturnValue({ data: { id: "cus_1", email: "shopper@example.com" }, isLoading: false });
  });

  test("lists the customer's past orders, newest first, each linking to its order page", async () => {
    mockUseOrders.mockReturnValue({ data: testOrders, isLoading: false, isError: false });
    renderAccountPage();

    const links = await screen.findAllByRole("link");
    // Newest (order_2, display_id 11) first.
    expect(links[0]).toHaveAttribute("href", "/order/order_2");
    expect(links[1]).toHaveAttribute("href", "/order/order_1");
    expect(screen.getByText("11")).toBeVisible();
    expect(screen.getByText("10")).toBeVisible();
    expect(screen.getByText(/€40\.00/)).toBeVisible();
    expect(screen.getByText(/€25\.00/)).toBeVisible();
  });

  test("shows an empty state when the customer has no past orders", async () => {
    mockUseOrders.mockReturnValue({ data: [], isLoading: false, isError: false });
    renderAccountPage();

    expect(await screen.findByText(/haven.t placed any orders/i)).toBeVisible();
  });

  test("redirects to /login with next set when there is no session", async () => {
    mockUseSession.mockReturnValue({ data: null, isLoading: false });
    mockUseOrders.mockReturnValue({ data: [], isLoading: false, isError: false });
    renderAccountPage();

    expect(mockReplace).toHaveBeenCalledWith(`/login?next=${encodeURIComponent("/account")}`);
  });

  // Round-1 review finding: a genuine backend failure must render a
  // distinct error, not the same empty state a customer with zero real
  // orders gets — otherwise an outage looks identical to "no orders yet".
  test("shows a distinct error message (not the empty state) when orders fail to load", async () => {
    mockUseOrders.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    renderAccountPage();

    expect(await screen.findByText(/couldn.t load your orders/i)).toBeVisible();
    expect(screen.queryByText(/haven.t placed any orders/i)).not.toBeInTheDocument();
  });
});
