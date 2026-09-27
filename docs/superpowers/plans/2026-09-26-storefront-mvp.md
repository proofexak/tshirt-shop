# Storefront MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A shopper can create an account, browse a fixed catalog of premade shirts, add items to a cart, and pay with a Stripe test card, ending in a real order recorded in Medusa.

**Architecture:** pnpm workspace monorepo. `apps/backend` is Medusa (products, customer auth, carts, orders, Stripe payment module) — the only thing touching Postgres. `apps/storefront` is Next.js App Router, talking to Medusa via its JS SDK, with TanStack Query for reads and Zustand for UI-only state.

**Tech Stack:** Next.js (App Router) + TypeScript, Tailwind, TanStack Query, Zustand, Medusa.js, Postgres, Stripe (test mode), Vitest, Playwright, pnpm workspaces.

**Spec:** `docs/superpowers/specs/2026-09-26-storefront-mvp-design.md`, amended by `docs/superpowers/specs/2026-09-27-storefront-admin-catalog-design.md` (Tasks 13–15)

## Global Constraints

- pnpm workspace monorepo: `apps/backend` (Medusa) + `apps/storefront` (Next.js) — no other apps.
- Local only — no deployment, no CI in this plan.
- No Better Auth — Medusa's built-in customer auth (email/password, JWT) is the only auth system.
- No transactional email — order confirmation is the on-screen page plus a server log line only.
- Stripe test-mode keys only.
- No *custom* admin UI — the catalog is managed via Medusa's built-in admin dashboard (`http://localhost:9000/app`, unmodified) and the seed script. (Amended 2026-09-27; was "No admin UI".)
- No design customizer, no Printful integration — out of scope, separate sub-projects.

## Review Focus

- Out-of-stock variant added via a stale page (stock changed between page load and add-to-cart) — add-to-cart must re-validate stock server-side, not trust the client. Test owned by Task 7.
- Stripe webhook delivered twice, or racing the client-side completion call — order completion must be idempotent on the Stripe payment intent id, from whichever path reaches it first. Test owned by Task 9.
- Signup with an email that already has a Medusa customer record — must surface a clear inline error, not a generic 500. Tests owned by Task 4 (backend) and Task 8 (frontend).
- Cart cookie present but pointing at a cart whose order already completed — must start a fresh cart, not error or risk double-charging. Test owned by Task 7.
- Variant picker where a size/design combination has no matching variant — must be non-selectable and must not crash the product page. Test owned by Task 6.

Added by the 2026-09-27 amendment (Tasks 13–15):

- A product created in the admin with an option not named "Size"/"Colour" (e.g. "Color", or only Medusa's default option) — the picker must render it and let a valid variant be bought. Test owned by Task 15.
- An admin-created product with no EUR price — must show "Price unavailable" with "Add to cart" disabled, not a crash or a €0 item. Test owned by Task 15.
- An image URL that 404s (file deleted from `static/`) — must fall back to the placeholder box, not a broken image. Test owned by Task 15.
- Re-running the seed against a DB that already has the premade products (and orders referencing them) — must end with exactly one product per handle. Test owned by Task 14.
- A variant with no linked image while the product has a thumbnail — must show the thumbnail, not nothing. Test owned by Task 15.

---

### Task 1: Monorepo & Medusa Backend Bootstrap

**Files:**
- Create: `package.json` (root, pnpm workspace root)
- Create: `pnpm-workspace.yaml` (packages: `apps/*`)
- Create: `apps/backend/` (Medusa v2 project, generated)
- Modify: `apps/backend/medusa-config.ts` — Postgres connection to local db `tshirt_shop_dev`
- Create: `apps/backend/.env.example` — `DATABASE_URL`, `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY` (empty placeholders)

**Interfaces:**
- Produces: a running Medusa server at `http://localhost:9000` — every later backend task builds on this.

- [ ] **Step 1: Create the pnpm workspace root**

`pnpm-workspace.yaml` with `packages: ["apps/*"]`; root `package.json` with `"private": true`.

- [ ] **Step 2: Scaffold Medusa into `apps/backend`**

Use Medusa's project generator targeting Postgres db `tshirt_shop_dev`. Copy `.env.example` alongside the generated `.env`.

- [ ] **Step 3: Run migrations**

Run: `pnpm --filter backend medusa db:migrate`
Expected: completes without error.

- [ ] **Step 4: Start the dev server and verify**

Run: `pnpm --filter backend dev`, then `curl http://localhost:9000/health`
Expected: `200 OK`

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-workspace.yaml apps/backend
git commit -m "Bootstrap monorepo and Medusa backend"
```

---

### Task 2: Seed Script for Premade Products

> **Superseded in part by Task 14** (2026-09-27 amendment): the catalog gains Colour options and photos; the out-of-stock case becomes `basic-hoodie` **Black / S**.

**Files:**
- Create: `apps/backend/src/scripts/seed-premade-products.ts`
- Test: `apps/backend/integration-tests/seed-products.spec.ts`

**Interfaces:**
- Consumes: Medusa server from Task 1.
- Produces: seeded catalog — product handles `classic-crew-tee`, `v-neck-tee`, `basic-hoodie`, each with variants for sizes `S`, `M`, `L`, `XL`. `basic-hoodie`'s `S` variant is seeded with inventory quantity `0` (the deliberate out-of-stock case used by Tasks 6 and 7); every other variant gets quantity `10`. Later tasks reference these exact handles and the zero-stock variant.

- [ ] **Step 1: Write the failing test**

```typescript
test("seed creates the expected catalog", async () => {
  const { products } = await storeClient.products.list();
  const handles = products.map(p => p.handle).sort();
  expect(handles).toEqual(["basic-hoodie", "classic-crew-tee", "v-neck-tee"]);
  const hoodie = products.find(p => p.handle === "basic-hoodie");
  const sizeS = hoodie.variants.find(v => v.title === "S");
  expect(sizeS.inventory_quantity).toBe(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter backend test seed-products.spec.ts`
Expected: FAIL — no products exist yet.

- [ ] **Step 3: Implement `seed-premade-products.ts`**

A script using Medusa's admin/JS SDK to create the three products above, each with 4 variants (S/M/L/XL) and the inventory levels specified in Interfaces.

- [ ] **Step 4: Run the script, then the test**

Run: `pnpm --filter backend exec ts-node src/scripts/seed-premade-products.ts && pnpm --filter backend test seed-products.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/scripts/seed-premade-products.ts apps/backend/integration-tests/seed-products.spec.ts
git commit -m "Add premade product seed script"
```

---

### Task 3: Stripe Payment Provider Configuration

**Files:**
- Modify: `apps/backend/medusa-config.ts` — register the Stripe payment provider module, reading `STRIPE_SECRET_KEY` from env.
- Test: `apps/backend/integration-tests/stripe-payment-session.spec.ts`

**Interfaces:**
- Consumes: `STRIPE_SECRET_KEY` env var (test-mode key).
- Produces: `stripe` enabled as a payment provider on the default region — Task 9 creates payment sessions against it.

- [ ] **Step 1: Write the failing test**

```typescript
test("creating a payment collection for a cart returns a Stripe client secret", async () => {
  const cart = await createTestCart();
  const { payment_collection } = await storeClient.paymentCollections.create({ cart_id: cart.id });
  const session = await storeClient.paymentCollections.initiatePaymentSession(payment_collection, { provider_id: "stripe" });
  expect(session.data.client_secret).toBeTruthy();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter backend test stripe-payment-session.spec.ts`
Expected: FAIL — `stripe` provider not registered.

- [ ] **Step 3: Register the Stripe module in `medusa-config.ts`**

Add the `@medusajs/payment-stripe` provider module, keyed by `STRIPE_SECRET_KEY`, enabled on the default region's payment providers.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter backend test stripe-payment-session.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/medusa-config.ts apps/backend/integration-tests/stripe-payment-session.spec.ts
git commit -m "Configure Stripe test-mode payment provider"
```

---

### Task 4: Customer Auth Endpoints

**Files:**
- Test: `apps/backend/integration-tests/customer-auth.spec.ts`

**Interfaces:**
- Produces: `POST /auth/customer/emailpass/register`, `POST /auth/customer/emailpass`, `GET /store/customers/me` — Task 8 (frontend signup/login) consumes these exact routes.

- [ ] **Step 1: Write the failing tests**

```typescript
test("register then fetch own customer record", async () => {
  const { token } = await authClient.register("shopper@example.com", "pass1234");
  const me = await storeClient.customers.me({ headers: { authorization: `Bearer ${token}` } });
  expect(me.email).toBe("shopper@example.com");
});

test("registering a duplicate email returns a 4xx with an identifiable error", async () => {
  await authClient.register("dup@example.com", "pass1234");
  const res = await authClient.registerRaw("dup@example.com", "pass1234");
  expect(res.status).toBeGreaterThanOrEqual(400);
  expect(res.status).toBeLessThan(500);
  expect(res.body.message).toMatch(/already exists|already registered/i);
});
```

- [ ] **Step 2: Run tests to verify current behavior**

Run: `pnpm --filter backend test customer-auth.spec.ts`
Expected: first test PASSES on Medusa's default behavior; if the duplicate-email test fails because Medusa returns a 500 or unclear message, proceed to Step 3 — otherwise skip Step 3.

- [ ] **Step 3 (only if Step 2's second test failed): normalize the duplicate-email error**

Add a thin error-mapping in front of the register route so a duplicate-email conflict always returns 409 with `{ message: "An account with this email already exists" }`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter backend test customer-auth.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/integration-tests/customer-auth.spec.ts
git commit -m "Pin customer auth behavior, including duplicate-email error"
```

---

### Task 5: Next.js Storefront Scaffold + Medusa Client Wrapper

**Files:**
- Create: `apps/storefront/` (Next.js App Router, TypeScript, Tailwind)
- Create: `apps/storefront/lib/medusa-client.ts` — exports `medusa`, an SDK client configured from `NEXT_PUBLIC_MEDUSA_BACKEND_URL`.
- Create: `apps/storefront/components/Header.tsx` — site-wide nav: a "Home" link and a right-hand nav slot containing "Sign up" and "Login" links. The right-hand slot is a named export (`Header`'s `rightSlot` prop, default `<SignupLoginLinks />`) so Tasks 7 and 8 can each replace its contents without editing Header's own markup.
- Modify: `apps/storefront/app/layout.tsx` — renders `<Header />` above `{children}`.
- Test: `apps/storefront/lib/medusa-client.test.ts`, `apps/storefront/components/Header.test.tsx`

**Interfaces:**
- Consumes: Medusa server from Task 1.
- Produces: `medusa` client (`import { medusa } from "@/lib/medusa-client"`) — every later frontend task imports this, not a fresh SDK instance. `Header` — accepts a `rightSlot?: ReactNode` prop; Task 7 passes a cart icon, Task 8 passes login-state-aware links. Both modify `layout.tsx`'s `<Header rightSlot={...} />` call, not `Header.tsx` itself.

- [ ] **Step 1: Write the failing tests**

```typescript
test("medusa client is configured against the backend URL", () => {
  expect(medusa.config.baseUrl).toBe(process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL);
});

test("header renders a Home link and the default right slot", () => {
  render(<Header />);
  expect(screen.getByRole("link", { name: "Home" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Sign up" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Login" })).toBeVisible();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter storefront test medusa-client.test.ts Header.test.tsx`
Expected: FAIL — modules don't exist.

- [ ] **Step 3: Implement `medusa-client.ts`, `Header.tsx`, and wire `layout.tsx`**

Export `medusa`, constructed from the Medusa JS SDK with `baseUrl: process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL`. `Header` takes `rightSlot?: ReactNode`, defaulting to a small `<SignupLoginLinks />` component (also exported from `Header.tsx`) rendering the "Sign up" and "Login" links.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter storefront test medusa-client.test.ts Header.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/storefront
git commit -m "Scaffold Next.js storefront, Medusa client wrapper, and site header"
```

---

### Task 6: Catalog & Product Detail Pages

> **Superseded in part by Task 15** (2026-09-27 amendment): `VariantPicker` becomes option-driven; pages gain photos.

**Files:**
- Create: `apps/storefront/app/page.tsx` — catalog listing
- Create: `apps/storefront/app/products/[handle]/page.tsx` — product detail + variant picker
- Create: `apps/storefront/components/VariantPicker.tsx`
- Create: `apps/storefront/hooks/useProducts.ts`, `apps/storefront/hooks/useProduct.ts`
- Test: `apps/storefront/components/VariantPicker.test.tsx`

**Interfaces:**
- Consumes: `medusa` client (Task 5), seeded catalog exact handles/variants (Task 2).
- Produces: `VariantPicker` — props `{ variants: Variant[], onSelect: (variantId: string) => void }` — consumed by the cart task's "add to cart" button.

- [ ] **Step 1: Write the failing tests**

```typescript
test("out-of-stock variant is rendered disabled", () => {
  render(<VariantPicker variants={basicHoodieVariants} onSelect={jest.fn()} />);
  expect(screen.getByRole("button", { name: "S" })).toBeDisabled();
});

test("a size with no matching variant renders without crashing and is not selectable", () => {
  render(<VariantPicker variants={partialVariantSet} onSelect={jest.fn()} />);
  expect(screen.getByRole("button", { name: "XL" })).toBeDisabled();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter storefront test VariantPicker.test.tsx`
Expected: FAIL — component doesn't exist.

- [ ] **Step 3: Implement `VariantPicker`, `useProducts`, `useProduct`, and both pages**

`VariantPicker` disables any size button with `inventory_quantity === 0` or with no corresponding variant in the passed list. Catalog and detail pages use `useProducts`/`useProduct` (TanStack Query) against `medusa`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter storefront test VariantPicker.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/storefront/app/page.tsx apps/storefront/app/products apps/storefront/components/VariantPicker.tsx apps/storefront/hooks
git commit -m "Add catalog and product detail pages"
```

---

### Task 7: Cart

**Files:**
- Create: `apps/storefront/lib/cart.ts` — `getOrCreateCart()`, `addLineItem(cartId, variantId, quantity)`
- Create: `apps/storefront/store/ui-store.ts` — Zustand store, `isCartDrawerOpen`, `openCartDrawer()`, `closeCartDrawer()`
- Create: `apps/storefront/components/CartDrawer.tsx` — includes a "Checkout" link to `/checkout`, rendered when the cart has at least one item.
- Create: `apps/storefront/components/CartIcon.tsx` — button showing item count, calls `openCartDrawer()` on click.
- Modify: `apps/storefront/app/products/[handle]/page.tsx` (Task 6) — add an "Add to cart" button, enabled only once `VariantPicker` has a selection, calling `addLineItem(cartId, selectedVariantId, 1)` then `openCartDrawer()`.
- Modify: `apps/storefront/app/layout.tsx` (Task 5) — pass `<CartIcon />` as `Header`'s `rightSlot` alongside the existing links (render both, not one replacing the other), and render `<CartDrawer />` once outside `Header`.
- Test: `apps/storefront/lib/cart.test.ts`, `apps/storefront/app/products/product-page-cart.test.tsx`

**Interfaces:**
- Consumes: `medusa` client (Task 5), `VariantPicker`'s selected variant id (Task 6), zero-stock `basic-hoodie` S variant (Task 2), `Header`'s `rightSlot` prop (Task 5).
- Produces: `getOrCreateCart()`, `addLineItem(cartId, variantId, quantity)` — consumed by Task 10's checkout page (see the renumbering note in Task 9/10 below — checkout is now Task 10).

- [ ] **Step 1: Write the failing tests**

```typescript
test("addLineItem rejects an out-of-stock variant", async () => {
  const cart = await getOrCreateCart();
  await expect(addLineItem(cart.id, hoodieSizeSVariantId, 1)).rejects.toThrow(/out of stock|insufficient inventory/i);
});

test("getOrCreateCart replaces a cart whose order already completed", async () => {
  const completedCart = await createAndCompleteTestCart();
  mockCartCookie(completedCart.id);
  const cart = await getOrCreateCart();
  expect(cart.id).not.toBe(completedCart.id);
  expect(cart.completed_at).toBeFalsy();
});

test("selecting a variant then clicking Add to cart calls addLineItem and opens the drawer", async () => {
  render(<ProductPage params={{ handle: "classic-crew-tee" }} />);
  await userEvent.click(await screen.findByRole("button", { name: "M" }));
  await userEvent.click(screen.getByRole("button", { name: "Add to cart" }));
  expect(mockAddLineItem).toHaveBeenCalledWith(expect.any(String), mVariantId, 1);
  expect(useUiStore.getState().isCartDrawerOpen).toBe(true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter storefront test cart.test.ts product-page-cart.test.tsx`
Expected: FAIL — module and wiring don't exist.

- [ ] **Step 3: Implement `cart.ts`, `CartIcon`, `CartDrawer`'s checkout link, and wire the product page + layout**

`addLineItem` calls Medusa's cart line-item API, letting Medusa's own inventory check surface the rejection (do not pre-check client-side only). `getOrCreateCart` reads the cart id cookie, fetches the cart, and — if missing or `completed_at` is set — creates a new cart and overwrites the cookie. The product page's "Add to cart" button is disabled until a variant is selected.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter storefront test cart.test.ts product-page-cart.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/storefront/lib/cart.ts apps/storefront/store/ui-store.ts apps/storefront/components/CartDrawer.tsx apps/storefront/components/CartIcon.tsx apps/storefront/app/products apps/storefront/app/layout.tsx
git commit -m "Add cart handling, add-to-cart wiring, and cart icon/drawer in the header"
```

---

### Task 8: Signup/Login Pages

**Files:**
- Create: `apps/storefront/app/signup/page.tsx`, `apps/storefront/app/login/page.tsx`
- Create: `apps/storefront/lib/auth.ts` — `signup(email, password)`, `login(email, password)`, `useSession()`
- Test: `apps/storefront/app/signup/signup-page.test.tsx`

**Interfaces:**
- Consumes: `/auth/customer/emailpass/register` and `/auth/customer/emailpass` (Task 4).
- Produces: `useSession()` — consumed by Task 9 (checkout requires a session) and Task 11 (account page).

- [ ] **Step 1: Write the failing test**

```typescript
test("signing up with an existing email shows an inline error", async () => {
  mockRegisterConflict(); // backend returns 409 per Task 4
  render(<SignupPage />);
  await userEvent.type(screen.getByLabelText("Email"), "dup@example.com");
  await userEvent.click(screen.getByRole("button", { name: "Sign up" }));
  expect(await screen.findByText(/already exists/i)).toBeVisible();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter storefront test signup-page.test.tsx`
Expected: FAIL — page doesn't exist.

- [ ] **Step 3: Implement `auth.ts`, `useSession`, and both pages**

`signup`/`login` call Task 4's routes; on success, store the returned token in an httpOnly cookie via a route handler. Signup page renders the backend's `message` inline on 4xx instead of a generic error.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter storefront test signup-page.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/storefront/app/signup apps/storefront/app/login apps/storefront/lib/auth.ts
git commit -m "Add signup and login pages"
```

---

### Task 9: Idempotent Order Completion + Stripe Webhook Handler

> **Ruling (pre-flight scan, 2026-09-26):** the original plan put the checkout page before the webhook, with the confirmation page (Task 11) "consuming an order id" that only the async webhook produced — but a client has no order id to redirect to right after Stripe confirms payment client-side; webhooks are server-to-server and arrive on their own schedule. Fix: extract the idempotent completion logic into a shared function used by *both* the webhook (this task, for the case the client-side call never lands) and a synchronous route the checkout page calls directly (Task 10, so it has an order id to redirect to immediately). This task now precedes checkout so that shared function exists before Task 10 needs it.

**Files:**
- Create: `apps/storefront/lib/order-completion.ts` — `completeOrderForPaymentIntent(paymentIntentId: string): Promise<{ orderId: string }>`
- Create: `apps/storefront/app/api/webhooks/stripe/route.ts` — calls `completeOrderForPaymentIntent`
- Test: `apps/storefront/lib/order-completion.test.ts`

**Interfaces:**
- Consumes: the Stripe payment provider (Task 3) — the payment intent's associated Medusa cart is resolved via the payment session Medusa already links to it, not passed in separately.
- Produces: `completeOrderForPaymentIntent(paymentIntentId)` — consumed by Task 10's checkout page (via a thin API route) and by this task's own webhook route. Also produces a completed Medusa order with `metadata.stripe_payment_intent_id` set — consumed by Task 11's confirmation page via its id.

- [ ] **Step 1: Write the failing tests**

```typescript
test("completing twice for the same payment intent returns the same order id and creates only one order", async () => {
  const cart = await createCartWithStripePaymentSession();
  const first = await completeOrderForPaymentIntent(cart.paymentIntentId);
  const second = await completeOrderForPaymentIntent(cart.paymentIntentId);
  expect(second.orderId).toBe(first.orderId);
  const orders = await adminClient.orders.list({ cart_id: cart.id });
  expect(orders.length).toBe(1);
});

test("the same webhook event delivered twice completes only one order", async () => {
  const event = buildPaymentIntentSucceededEvent({ payment_intent: "pi_123" });
  await POST(webhookRequest(event));
  await POST(webhookRequest(event));
  const orders = await adminClient.orders.list({ cart_id: testCart.id });
  expect(orders.length).toBe(1);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter storefront test order-completion.test.ts route.test.ts`
Expected: FAIL — module and route don't exist.

- [ ] **Step 3: Implement `order-completion.ts` and the webhook route**

`completeOrderForPaymentIntent`: query Medusa for an existing order with `metadata.stripe_payment_intent_id` equal to `paymentIntentId`; if found, return its id without completing anything again. Otherwise, resolve the cart from the payment intent's Medusa payment session, complete the cart, set `metadata.stripe_payment_intent_id` on the resulting order, and return its id. Log the order-placed event server-side (this is the "confirmation email" substitute per spec). The webhook route calls this function with the event's `payment_intent` and returns `200`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter storefront test order-completion.test.ts route.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/storefront/lib/order-completion.ts apps/storefront/app/api/webhooks
git commit -m "Add idempotent order completion and Stripe webhook handler"
```

---

### Task 10: Checkout Page + Stripe Elements

**Files:**
- Create: `apps/storefront/app/checkout/page.tsx`
- Create: `apps/storefront/lib/checkout.ts` — `createPaymentSession(cartId)`
- Create: `apps/storefront/app/api/orders/complete/route.ts` — `POST { paymentIntentId }`, calls Task 9's `completeOrderForPaymentIntent`, returns `{ orderId }`
- Test: `apps/storefront/app/checkout/checkout-page.test.tsx`

**Interfaces:**
- Consumes: `getOrCreateCart` (Task 7), `useSession` (Task 8), `stripe` payment provider (Task 3), `completeOrderForPaymentIntent` (Task 9, via this task's own `/api/orders/complete` route).
- Produces: a client-side redirect to `/order/[orderId]` on payment success — the entry point Task 11's confirmation page expects.

- [ ] **Step 1: Write the failing tests**

```typescript
test("checkout redirects unauthenticated users to login", () => {
  mockSession(null);
  render(<CheckoutPage />);
  expect(mockRouter.push).toHaveBeenCalledWith("/login");
});

test("checkout renders Stripe Elements with the session's client secret", async () => {
  mockSession(testUser);
  mockCart({ items: [testLineItem] });
  mockCreatePaymentSession({ client_secret: "secret_123" });
  render(<CheckoutPage />);
  expect(await screen.findByTestId("stripe-elements")).toHaveAttribute("data-client-secret", "secret_123");
});

test("checkout redirects to catalog with a message when the cart has no items", async () => {
  mockSession(testUser);
  mockCart({ items: [] });
  render(<CheckoutPage />);
  expect(mockRouter.push).toHaveBeenCalledWith("/?message=Your+cart+was+empty+or+expired");
});

test("on successful payment confirmation, completes the order and redirects to it", async () => {
  mockSession(testUser);
  mockCart({ items: [testLineItem] });
  mockStripeConfirmPayment({ paymentIntent: { id: "pi_123", status: "succeeded" } });
  mockCompleteOrderRoute({ orderId: "order_456" });
  render(<CheckoutPage />);
  await userEvent.click(await screen.findByRole("button", { name: "Pay" }));
  expect(mockCompleteOrderRoute).toHaveBeenCalledWith("pi_123");
  expect(mockRouter.push).toHaveBeenCalledWith("/order/order_456");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter storefront test checkout-page.test.tsx`
Expected: FAIL — page doesn't exist.

- [ ] **Step 3: Implement `checkout.ts`, the `/api/orders/complete` route, and the checkout page**

Checkout page collects shipping address, calls `createPaymentSession(cartId)` (wraps Medusa's payment-collection + initiate-session calls from Task 3), mounts Stripe Elements with the returned client secret. Before rendering Elements, check `cart.items.length`: if zero — which is what an expired/invalid cart cookie becomes once `getOrCreateCart` (Task 7) silently replaces it — redirect to `/` with a `message` query param instead of rendering a payment form for nothing to pay for. On the Stripe Elements "Pay" button's `confirmPayment` success callback, `POST` the resulting `paymentIntent.id` to `/api/orders/complete`, then `router.push` to `/order/${orderId}` using the response. The `/api/orders/complete` route is a thin wrapper: it calls Task 9's `completeOrderForPaymentIntent` and returns its result as JSON — the webhook (Task 9) remains the fallback path for a client that never gets to run this callback (browser closed mid-payment, etc.), and both paths hit the same idempotency check, so a client success followed by a webhook delivery (or the reverse) still produces exactly one order.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter storefront test checkout-page.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/storefront/app/checkout apps/storefront/lib/checkout.ts apps/storefront/app/api/orders
git commit -m "Add checkout page with Stripe Elements and synchronous order completion"
```

---

### Task 11: Order Confirmation Page + Account Page

**Files:**
- Create: `apps/storefront/app/order/[id]/page.tsx`
- Create: `apps/storefront/app/account/page.tsx`
- Test: `apps/storefront/app/order/order-page.test.tsx`

**Interfaces:**
- Consumes: order id, arrived at via Task 10's post-payment redirect to `/order/[orderId]`. `useSession` (Task 8).
- Produces: nothing consumed by later tasks — this is a leaf.

- [ ] **Step 1: Write the failing test**

```typescript
test("order confirmation page shows the order's line items and total", async () => {
  mockOrder(testOrder);
  render(<OrderPage params={{ id: testOrder.id }} />);
  expect(await screen.findByText(testOrder.display_id)).toBeVisible();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter storefront test order-page.test.tsx`
Expected: FAIL — page doesn't exist.

- [ ] **Step 3: Implement both pages**

Confirmation page fetches the order by id and renders line items/total. Account page (requires session) lists the current customer's past orders.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter storefront test order-page.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/storefront/app/order apps/storefront/app/account
git commit -m "Add order confirmation and account pages"
```

---

### Task 12: Playwright E2E Golden Path

**Files:**
- Create: `apps/storefront/e2e/golden-path.spec.ts`

**Interfaces:**
- Consumes: the full app from Tasks 1–11.

- [ ] **Step 1: Write the e2e test**

```typescript
test("browse, sign up, add to cart, checkout, see confirmation", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Classic Crew Tee" }).click();
  await page.getByRole("button", { name: "Black" }).click(); // amended 2026-09-27 (Task 14 colours)
  await page.getByRole("button", { name: "M" }).click();
  await page.getByRole("button", { name: "Add to cart" }).click();
  await page.getByRole("link", { name: "Sign up" }).click();
  await page.getByLabel("Email").fill(`shopper-${Date.now()}@example.com`);
  await page.getByLabel("Password").fill("pass1234");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.getByRole("link", { name: "Checkout" }).click();
  const stripeFrame = page.frameLocator("iframe[title*='Secure payment']");
  await stripeFrame.getByLabel("Card number").fill("4242424242424242");
  await stripeFrame.getByLabel("Expiration").fill("12/34");
  await stripeFrame.getByLabel("CVC").fill("123");
  await page.getByRole("button", { name: "Pay" }).click();
  await expect(page.getByText(/order confirmed/i)).toBeVisible();
});
```

- [ ] **Step 2: Run it against the full local stack**

Run: `pnpm --filter storefront exec playwright test golden-path.spec.ts`
Expected: PASS (both `apps/backend` and `apps/storefront` running locally, seed script already run)

- [ ] **Step 3: Commit**

```bash
git add apps/storefront/e2e/golden-path.spec.ts
git commit -m "Add golden-path e2e test"
```

---

### Task 13: Admin Dashboard Access & File Storage

**Files:**
- Create: `apps/backend/src/scripts/create-admin.ts`
- Modify: `apps/backend/package.json` — script `"admin:create": "medusa exec ./src/scripts/create-admin.ts"`
- Modify: `apps/backend/medusa-config.ts` — register the File module with the local provider explicitly
- Modify: `apps/backend/.env.example` — add `ADMIN_EMAIL=`, `ADMIN_PASSWORD=` (empty)
- Modify: `apps/backend/.gitignore` — add `/static`
- Modify: `apps/backend/README.md` — "Admin dashboard" section
- Test: `apps/backend/integration-tests/admin-catalog.spec.ts`

**Interfaces:**
- Consumes: shared harness `integration-tests/test-runner-helpers.ts` and `initialDataSeed` (Task 2); region "Europe" / `eur`; Default Sales Channel.
- Produces: `createAdminUser(container: MedusaContainer, input: { email: string; password: string }): Promise<{ userId: string; created: boolean }>` — idempotent (an existing user with that email returns `{ created: false }`, no error). Uploaded files served at `http://localhost:9000/static/<file>` — Task 15's `remotePatterns` depends on this URL shape.

- [ ] **Step 1: Write the failing tests** (live `medusaIntegrationTestRunner`, unique `TEST_DB_NAME`)

```typescript
test("createAdminUser is idempotent", async () => {
  const first = await createAdminUser(container, { email: "owner@example.com", password: "admin1234" });
  const second = await createAdminUser(container, { email: "owner@example.com", password: "admin1234" });
  expect(first.created).toBe(true);
  expect(second).toEqual({ userId: first.userId, created: false });
});

test("an admin-created product with an image is visible in the store API", async () => {
  // log in: POST /auth/user/emailpass → token; upload: POST /admin/uploads (multipart PNG) → files[0].url
  // create: POST /admin/products { title: "Test Tee", handle: "test-tee", status: "published",
  //   images: [{ url }], options: [{ title: "Size", values: ["M"] }],
  //   variants: [{ title: "M", options: { Size: "M" }, prices: [{ currency_code: "eur", amount: 25 }] }],
  //   sales_channels: [{ id: defaultSalesChannelId }] }
  const { products } = await storeGet("/store/products?handle=test-tee&fields=*images");
  expect(products).toHaveLength(1);
  expect(products[0].images[0].url).toBe(uploadedUrl);
  expect(uploadedUrl).toMatch(/^http:\/\/localhost:9000\/static\//);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter backend test admin-catalog.spec.ts`
Expected: FAIL — `createAdminUser` not found.

- [ ] **Step 3: Implement `createAdminUser` + the default export, and configure file storage**

`createAdminUser` does what `medusa user -e -p` does (auth identity via the `emailpass` provider + user, linked) — reuse Medusa's own workflow/CLI logic rather than hand-writing auth rows. The default export reads `ADMIN_EMAIL`/`ADMIN_PASSWORD` from env and exits non-zero with a message naming both variables if either is empty. In `medusa-config.ts`, register `@medusajs/medusa/file` with the `@medusajs/medusa/file-local` provider, options `upload_dir: "static"`, `backend_url: "http://localhost:9000/static"`. README section: how to run `admin:create`, the dashboard URL, and the new-product checklist from the spec (published, Default Sales Channel, EUR price).

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm --filter backend test` (whole backend suite — seed and auth specs must stay green)
Expected: PASS

- [ ] **Step 5: Create the dev admin and verify the dashboard login**

The admin credentials are the user's to choose — never invent them. If `ADMIN_EMAIL`/`ADMIN_PASSWORD` are empty in `apps/backend/.env`, skip this step and say so in the report (verify only the empty-env error message). Otherwise run: `pnpm --filter backend admin:create` twice, then with `pnpm --filter backend dev` running: `curl -s -X POST localhost:9000/auth/user/emailpass -H 'content-type: application/json' -d '{"email":"…","password":"…"}'`
Expected: first run creates, second reports it already exists; curl returns `{"token": …}`.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/scripts/create-admin.ts apps/backend/package.json apps/backend/medusa-config.ts apps/backend/.env.example apps/backend/.gitignore apps/backend/README.md apps/backend/integration-tests/admin-catalog.spec.ts
git commit -m "Enable Medusa admin dashboard: admin account script and local file storage"
```

---

### Task 14: Re-seed Catalog with Colours & Photos

**Files:**
- Create: `apps/backend/seed-assets/generate-placeholders.mjs` (one-off generator, uses `sharp` as a backend devDependency)
- Create: `apps/backend/seed-assets/{classic-crew-tee,v-neck-tee,basic-hoodie}-{black,white}.png` (6 files, committed output of the generator)
- Modify: `apps/backend/src/scripts/seed-premade-products.ts`
- Modify: `apps/backend/integration-tests/seed-products.spec.ts`

**Interfaces:**
- Consumes: file storage (Task 13); region/sales channel/stock location/shipping profile from `initialDataSeed`.
- Produces (replaces Task 2's catalog shape; Tasks 7, 12, 15 depend on these exact values): handles `classic-crew-tee`, `v-neck-tee`, `basic-hoodie`; options **Size** (`S`,`M`,`L`,`XL`) and **Colour** (`Black`,`White`); variant titles `"<Colour> / <Size>"`; stock 10 each except `basic-hoodie` **Black / S** = `0`; `v-neck-tee` has **no** `White / XL` variant (7 variants; the others have 8); each variant linked to its colour's image; product thumbnail = the Black image. Default export signature unchanged: `seedPremadeProducts({ container })`.

- [ ] **Step 1: Rewrite the seed test (failing)**

```typescript
test("seed creates colour × size variants with the deliberate edge cases", async () => {
  const products = await listStoreProducts("*options.values,*variants.options,*variants.images,+variants.inventory_quantity,thumbnail,*images");
  expect(products.map(p => p.handle).sort()).toEqual(["basic-hoodie", "classic-crew-tee", "v-neck-tee"]);
  const byHandle = Object.fromEntries(products.map(p => [p.handle, p]));
  expect(byHandle["classic-crew-tee"].variants).toHaveLength(8);
  expect(byHandle["v-neck-tee"].variants.map(v => v.title)).not.toContain("White / XL");
  expect(byHandle["v-neck-tee"].variants).toHaveLength(7);
  expect(variant(byHandle["basic-hoodie"], "Black / S").inventory_quantity).toBe(0);
  expect(variant(byHandle["basic-hoodie"], "White / S").inventory_quantity).toBe(10);
  for (const p of products) {
    expect(p.thumbnail).toMatch(/black/);
    const colourOption = p.options.find(o => o.title === "Colour");
    for (const v of p.variants) {
      const colour = v.options.find(o => o.option_id === colourOption.id).value.toLowerCase();
      expect(v.images.map(i => i.url).join()).toMatch(new RegExp(`${p.handle}-${colour}`));
    }
  }
});

test("re-running the seed leaves exactly one product per handle", async () => {
  await seedPremadeProducts({ container: getContainer() });
  const products = await listStoreProducts("id");
  expect(products).toHaveLength(3);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter backend test seed-products.spec.ts`
Expected: FAIL — variants are size-only, no images.

- [ ] **Step 3: Generate the 6 placeholder PNGs**

Run: `node apps/backend/seed-assets/generate-placeholders.mjs` — 600×600 flat shirt silhouette in the colour (black `#1a1a1a`, white `#f5f5f5` on a light-grey background), product name as text. Commit the output; the seed never runs the generator.

- [ ] **Step 4: Implement the seed changes**

Before creating, delete any existing product with a premade handle via Medusa's delete workflow (re-runnable). Upload each PNG with core-flows' file-upload workflow (filenames keep the `<handle>-<colour>` stem so URLs are identifiable), create products with the options/variants above, then link each variant to its colour's image using Medusa 2.21.1's native variant-image support (`product_variant_product_image`; find the matching core-flows workflow). Inventory levels as in Interfaces.

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm --filter backend test`
Expected: PASS (seed, auth, admin specs)

- [ ] **Step 6: Re-seed the local dev DB**

Run: `pnpm --filter backend seed:premade`, then `curl` the store API for `basic-hoodie` with `fields=*variants,+variants.inventory_quantity`
Expected: 8 variants titled `<Colour> / <Size>`, Black / S at 0; each image URL loads (`curl -sI` → 200).

- [ ] **Step 7: Commit**

```bash
git add apps/backend/seed-assets apps/backend/src/scripts/seed-premade-products.ts apps/backend/integration-tests/seed-products.spec.ts apps/backend/package.json pnpm-lock.yaml
git commit -m "Re-seed premade catalog with colour variants and per-colour photos"
```

---

### Task 15: Option-Driven Variant Picker, Product Photos & Thumbnails

**Files:**
- Modify: `apps/storefront/components/VariantPicker.tsx` (rewrite)
- Create: `apps/storefront/lib/product-image.ts`
- Create: `apps/storefront/components/ProductImage.tsx`
- Modify: `apps/storefront/hooks/useProduct.ts`, `apps/storefront/hooks/useProducts.ts` (fields)
- Modify: `apps/storefront/app/products/[handle]/page.tsx`, `apps/storefront/app/page.tsx`
- Modify: `apps/storefront/components/CartDrawer.tsx` (show `variant_title`)
- Modify: `apps/storefront/next.config.ts` (`images.remotePatterns`)
- Test: `apps/storefront/components/VariantPicker.test.tsx` (rewrite), `apps/storefront/lib/product-image.test.ts`, `apps/storefront/components/ProductImage.test.tsx`
- Modify tests: `apps/storefront/app/products/product-page-cart.test.tsx`, `apps/storefront/lib/cart.test.ts`

**Interfaces:**
- Consumes: Task 14's catalog shape; Task 13's image URL shape; Task 7's `addToCart(variantId, quantity)` (unchanged).
- Produces:
  - `VariantPicker({ options, variants, onSelect, onSelectionChange }: { options: ProductOption[]; variants: Variant[]; onSelect: (variantId: string | null) => void; onSelectionChange?: (selection: Record<string, string>) => void })` — `selection` maps option **id** → chosen value. `onSelectionChange` is an addition to the spec's props, needed so the page can swap the photo on a colour choice before a size is picked.
  - `ProductOption = { id: string; title: string; values: { value: string }[] }`; `Variant = { id: string; title: string; inventory_quantity?: number | null; options?: { option_id: string; value: string }[] | null; images?: { url: string }[] | null }`
  - `pickProductImage(product: { thumbnail?: string | null; images?: { url: string }[] | null; variants?: Variant[] | null }, selection: Record<string, string>): string | null`
  - `ProductImage({ src, alt }: { src: string | null; alt: string })`

- [ ] **Step 1: Write the failing tests**

```typescript
// VariantPicker.test.tsx — fixtures mirror Task 14 (v-neck: no White/XL; hoodie: Black/S qty 0)
test("renders one labelled group per option", () => {
  render(<VariantPicker options={vneckOptions} variants={vneckVariants} onSelect={vi.fn()} />);
  expect(screen.getByRole("group", { name: "Size" })).toBeVisible();
  expect(screen.getByRole("group", { name: "Colour" })).toBeVisible();
});
test("a combination with no matching variant is disabled", async () => { /* click White → XL disabled; M enabled */ });
test("an out-of-stock combination is disabled", async () => { /* hoodie: click Black → S disabled */ });
test("onSelect gets null until every option is chosen, then the variant id", async () => { /* Black → onSelect(null); M → onSelect(blackMId) */ });
test("a choice made impossible by a new choice is cleared", async () => { /* v-neck: XL then White → XL cleared, onSelect(null) */ });
test("a single-value option is preselected", () => { /* one option "Color" with value "Red" + one variant → onSelect(redId) on mount; also covers non-'Size'/'Colour' names */ });
test("sizes are ordered S, M, L, XL regardless of API order", () => { /* values given as XL,S,L,M */ });
test("a product with no in-stock variant renders every choice disabled", () => { /* all qty 0 → every button disabled, no crash */ });

// product-image.test.ts
test("uses the image of a variant matching the selection", () => { expect(pickProductImage(tee, { [colourId]: "White" })).toBe(whiteUrl); });
test("falls back to thumbnail, then first image, then null", () => { /* variant without images → thumbnail; no thumbnail → images[0]; nothing → null */ });

// ProductImage.test.tsx
test("renders the placeholder when src is null or the image errors", () => { /* fireEvent.error(img) → placeholder box (data-testid="image-placeholder") */ });

// product-page-cart.test.tsx additions
test("choosing White swaps the product photo", async () => { /* img src contains white url after clicking White */ });
test("a product with no EUR price shows 'Price unavailable' and cannot be added", async () => { /* Add to cart disabled even with a full selection */ });
```

Existing tests change: `product-page-cart.test.tsx` fixtures gain options and clicks become `Black` then `M` (assert `mockAddToCart` called with the Black / M id); `lib/cart.test.ts`'s `getVariantId(handle, size)` becomes `getVariantId(handle, colour, size)` matching variant title `"<Colour> / <Size>"` — completed-cart fixture uses `classic-crew-tee` Black / L, out-of-stock test uses `basic-hoodie` Black / S.

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter storefront test VariantPicker.test.tsx product-image.test.ts ProductImage.test.tsx product-page-cart.test.tsx`
Expected: FAIL — new props/modules don't exist.

- [ ] **Step 3: Implement**

Picker: a value is enabled iff some variant with `inventory_quantity > 0` matches that value plus every *other* current selection. Hooks request `thumbnail,*images,*options.values,*variants.options,*variants.images` on top of the existing fields. `ProductImage` wraps `next/image` (fixed square, `onError` → placeholder). `remotePatterns` derives protocol/hostname/port from `NEXT_PUBLIC_MEDUSA_BACKEND_URL` with pathname `/static/**`. Catalog card: `ProductImage` of `thumbnail` above the existing title link (link's accessible name stays exactly the title). Product page: `ProductImage` of `pickProductImage(product, selection)`; "Price unavailable" and disabled Add to cart when the selected (or first) variant has no `calculated_price`. CartDrawer line: `{item.title} — {item.variant_title} × {item.quantity}`.

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm --filter storefront test` (backend up, Task 14 seed applied to the dev DB), then `pnpm --filter storefront exec next build`
Expected: PASS; build succeeds.

- [ ] **Step 5: Verify against the live admin path**

With both servers up: in the dashboard (or admin API) create a product with options `Size`/`Color` (US spelling), one photo, EUR price, published → it appears in the catalog with its thumbnail and a valid variant can be added to the cart.
Expected: as described; report what was done.

- [ ] **Step 6: Commit**

```bash
git add apps/storefront/components apps/storefront/lib apps/storefront/hooks apps/storefront/app apps/storefront/next.config.ts
git commit -m "Option-driven variant picker, per-colour product photos, catalog thumbnails"
```
