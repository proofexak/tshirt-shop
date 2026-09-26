import { beforeEach, describe, expect, test, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ProductPage from "./[handle]/page";
import { useUiStore } from "@/store/ui-store";

// vi.mock factories are hoisted above this file's own top-level code, so
// anything they close over has to come from vi.hoisted() — a plain `const`
// declared below would still be in its temporal dead zone when the factory
// actually runs.
const { mVariantId, mockProduct, mockGetCart, mockAddLineItem } = vi.hoisted(() => {
  const mVariantId = "variant_m_123";
  return {
    mVariantId,
    mockProduct: {
      id: "prod_1",
      title: "Classic Crew Tee",
      variants: [
        { id: "variant_s_123", title: "S", inventory_quantity: 10 },
        { id: mVariantId, title: "M", inventory_quantity: 10 },
        { id: "variant_l_123", title: "L", inventory_quantity: 10 },
        { id: "variant_xl_123", title: "XL", inventory_quantity: 10 },
      ],
    },
    mockGetCart: vi.fn(),
    mockAddLineItem: vi.fn(),
  };
});

// This is a UI test (ruling 4): the product fetch is mocked here, and the
// real Medusa-backed out-of-stock rejection is covered by lib/cart.test.ts.
vi.mock("@/hooks/useProduct", () => ({
  useProduct: () => ({ data: mockProduct, isLoading: false, isError: false }),
}));

vi.mock("@/lib/cart-actions", () => ({
  getCart: (...args: unknown[]) => mockGetCart(...args),
  addLineItem: (...args: unknown[]) => mockAddLineItem(...args),
}));

// React 19's `use()` reads the page's `params` promise; on first render (an
// already-resolved `Promise.resolve()`) it still suspends once, relying on
// its own retry-on-settle to repaint. That retry doesn't reliably fire in
// this jsdom + @testing-library/react environment (confirmed with a minimal
// repro outside this file: a plain effect+state update repaints fine, but a
// use()-thrown promise's internal retry never triggers a second render pass
// here even after generous real-timer flushes). Forcing one more render
// with the *same* params promise, once it has settled, makes `use()` return
// synchronously instead of suspending again — this doesn't change the
// prescribed render call itself (still `<ProductPage params={Promise.resolve(...)} />`),
// it's a test-side flush for a real environment gap.
async function renderProductPage() {
  const queryClient = new QueryClient();
  const params = Promise.resolve({ handle: "classic-crew-tee" });
  const ui = (
    <QueryClientProvider client={queryClient}>
      <ProductPage params={params} />
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

describe("product page — add to cart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCart.mockResolvedValue({ id: "cart_test123", items: [] });
    mockAddLineItem.mockResolvedValue({ id: "cart_test123", items: [] });
    useUiStore.setState({ isCartDrawerOpen: false });
  });

  test("Add to cart is disabled until a size is selected", async () => {
    await renderProductPage();

    expect(await screen.findByRole("button", { name: "Add to cart" })).toBeDisabled();
  });

  test("selecting a variant then clicking Add to cart calls addLineItem and opens the drawer", async () => {
    await renderProductPage();

    await userEvent.click(await screen.findByRole("button", { name: "M" }));
    await userEvent.click(screen.getByRole("button", { name: "Add to cart" }));

    await waitFor(() =>
      expect(mockAddLineItem).toHaveBeenCalledWith(expect.any(String), mVariantId, 1)
    );
    expect(useUiStore.getState().isCartDrawerOpen).toBe(true);
  });

  test("shows a visible error when addLineItem rejects (e.g. out of stock)", async () => {
    mockAddLineItem.mockRejectedValueOnce(new Error("This variant is out of stock."));
    await renderProductPage();

    await userEvent.click(await screen.findByRole("button", { name: "M" }));
    await userEvent.click(screen.getByRole("button", { name: "Add to cart" }));

    expect(await screen.findByText(/out of stock/i)).toBeInTheDocument();
    // A failed add must not open the drawer.
    expect(useUiStore.getState().isCartDrawerOpen).toBe(false);
  });
});
