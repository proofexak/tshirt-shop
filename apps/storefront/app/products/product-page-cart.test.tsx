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
const {
  mBlackMVariantId,
  mockProduct,
  mockNoPriceProduct,
  productRef,
  blackUrl,
  whiteUrl,
  mockAddToCart,
} = vi.hoisted(() => {
  const mBlackMVariantId = "variant_black_m_123";
  const colourOptionId = "opt_colour_123";
  const sizeOptionId = "opt_size_123";
  const blackUrl = "http://localhost:9000/static/1-classic-crew-tee-black.png";
  const whiteUrl = "http://localhost:9000/static/2-classic-crew-tee-white.png";

  function makeVariants(withPrice: boolean) {
    const sizes = ["S", "M", "L", "XL"];
    const colours: Array<["Black" | "White", string]> = [
      ["Black", blackUrl],
      ["White", whiteUrl],
    ];
    return colours.flatMap(([colour, imageUrl]) =>
      sizes.map((size) => ({
        id: colour === "Black" && size === "M" ? mBlackMVariantId : `variant_${colour}_${size}`,
        title: `${colour} / ${size}`,
        inventory_quantity: 10,
        options: [
          { option_id: colourOptionId, value: colour },
          { option_id: sizeOptionId, value: size },
        ],
        images: [{ url: imageUrl }],
        ...(withPrice ? { calculated_price: { calculated_amount: 20, currency_code: "eur" } } : {}),
      }))
    );
  }

  const options = [
    { id: colourOptionId, title: "Colour", values: [{ value: "Black" }, { value: "White" }] },
    { id: sizeOptionId, title: "Size", values: [{ value: "S" }, { value: "M" }, { value: "L" }, { value: "XL" }] },
  ];

  const mockProduct = {
    id: "prod_1",
    title: "Classic Crew Tee",
    thumbnail: blackUrl,
    images: [{ url: blackUrl }, { url: whiteUrl }],
    options,
    variants: makeVariants(true),
  };

  const mockNoPriceProduct = {
    ...mockProduct,
    variants: makeVariants(false),
  };

  // Mutable so individual tests can point the mocked hook at a different
  // fixture (e.g. the no-price product) without re-mocking the module.
  const productRef = { current: mockProduct };

  return {
    mBlackMVariantId,
    mockProduct,
    mockNoPriceProduct,
    productRef,
    blackUrl,
    whiteUrl,
    mockAddToCart: vi.fn(),
  };
});

// This is a UI test (ruling 4): the product fetch is mocked here, and the
// real Medusa-backed out-of-stock rejection is covered by lib/cart.test.ts.
vi.mock("@/hooks/useProduct", () => ({
  useProduct: () => ({ data: productRef.current, isLoading: false, isError: false }),
}));

// The product page no longer reads the cart at all (post-review-round-1
// ruling): addToCart(variantId, quantity) resolves the shopper's own cart
// from the httpOnly cookie server-side, so this test only needs to mock
// that one action — no getCart mock needed here any more.
vi.mock("@/lib/cart-actions", () => ({
  addToCart: (...args: unknown[]) => mockAddToCart(...args),
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
    productRef.current = mockProduct;
    mockAddToCart.mockResolvedValue({ ok: true, cart: { id: "cart_test123", items: [] } });
    useUiStore.setState({ isCartDrawerOpen: false });
  });

  test("Add to cart is disabled until every option is selected", async () => {
    await renderProductPage();

    expect(await screen.findByRole("button", { name: "Add to cart" })).toBeDisabled();
  });

  test("selecting Black then M and clicking Add to cart calls addToCart and opens the drawer", async () => {
    await renderProductPage();

    await userEvent.click(await screen.findByRole("button", { name: "Black" }));
    await userEvent.click(screen.getByRole("button", { name: "M" }));
    await userEvent.click(screen.getByRole("button", { name: "Add to cart" }));

    await waitFor(() => expect(mockAddToCart).toHaveBeenCalledWith(mBlackMVariantId, 1));
    expect(useUiStore.getState().isCartDrawerOpen).toBe(true);
  });

  test("shows a visible error when addToCart reports the item is out of stock", async () => {
    mockAddToCart.mockResolvedValueOnce({ ok: false, error: "out_of_stock" });
    await renderProductPage();

    await userEvent.click(await screen.findByRole("button", { name: "Black" }));
    await userEvent.click(screen.getByRole("button", { name: "M" }));
    await userEvent.click(screen.getByRole("button", { name: "Add to cart" }));

    expect(await screen.findByText(/out of stock/i)).toBeInTheDocument();
    // A failed add must not open the drawer.
    expect(useUiStore.getState().isCartDrawerOpen).toBe(false);
  });

  test("choosing White swaps the product photo", async () => {
    await renderProductPage();

    const img = await screen.findByRole("img", { name: "Classic Crew Tee" });
    expect(decodeURIComponent(img.getAttribute("src") ?? "")).toContain(blackUrl);

    await userEvent.click(screen.getByRole("button", { name: "White" }));

    await waitFor(() => {
      const swapped = screen.getByRole("img", { name: "Classic Crew Tee" });
      expect(decodeURIComponent(swapped.getAttribute("src") ?? "")).toContain(whiteUrl);
    });
  });

  test("a product with no EUR price shows 'Price unavailable' and cannot be added", async () => {
    productRef.current = mockNoPriceProduct;
    await renderProductPage();

    expect(await screen.findByText("Price unavailable")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Black" }));
    await userEvent.click(screen.getByRole("button", { name: "M" }));

    expect(screen.getByRole("button", { name: "Add to cart" })).toBeDisabled();
  });
});
