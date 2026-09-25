# Storefront MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A shopper can create an account, browse a fixed catalog of premade shirts, add items to a cart, and pay with a Stripe test card, ending in a real order recorded in Medusa.

**Architecture:** pnpm workspace monorepo. `apps/backend` is Medusa (products, customer auth, carts, orders, Stripe payment module) — the only thing touching Postgres. `apps/storefront` is Next.js App Router, talking to Medusa via its JS SDK, with TanStack Query for reads and Zustand for UI-only state.

**Tech Stack:** Next.js (App Router) + TypeScript, Tailwind, TanStack Query, Zustand, Medusa.js, Postgres, Stripe (test mode), Vitest, Playwright, pnpm workspaces.

**Spec:** `docs/superpowers/specs/2026-09-26-storefront-mvp-design.md`

## Global Constraints

- pnpm workspace monorepo: `apps/backend` (Medusa) + `apps/storefront` (Next.js) — no other apps.
- Local only — no deployment, no CI in this plan.
- No Better Auth — Medusa's built-in customer auth (email/password, JWT) is the only auth system.
- No transactional email — order confirmation is the on-screen page plus a server log line only.
- Stripe test-mode keys only.
- No admin UI — catalog is seeded via script, never edited through Medusa admin.
- No design customizer, no Printful integration — out of scope, separate sub-projects.

## Review Focus

- Out-of-stock variant added via a stale page (stock changed between page load and add-to-cart) — add-to-cart must re-validate stock server-side, not trust the client. Test owned by Task 7.
- Stripe webhook delivered twice, or before the client-side cart-complete call lands — order completion must be idempotent on the Stripe payment intent id. Test owned by Task 10.
- Signup with an email that already has a Medusa customer record — must surface a clear inline error, not a generic 500. Tests owned by Task 4 (backend) and Task 8 (frontend).
- Cart cookie present but pointing at a cart whose order already completed — must start a fresh cart, not error or risk double-charging. Test owned by Task 7.
- Variant picker where a size/design combination has no matching variant — must be non-selectable and must not crash the product page. Test owned by Task 6.

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
- Test: `apps/storefront/lib/medusa-client.test.ts`

**Interfaces:**
- Consumes: Medusa server from Task 1.
- Produces: `medusa` client (`import { medusa } from "@/lib/medusa-client"`) — every later frontend task imports this, not a fresh SDK instance.

- [ ] **Step 1: Write the failing test**

```typescript
test("medusa client is configured against the backend URL", () => {
  expect(medusa.config.baseUrl).toBe(process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter storefront test medusa-client.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement `medusa-client.ts`**

Export `medusa`, constructed from the Medusa JS SDK with `baseUrl: process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter storefront test medusa-client.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/storefront
git commit -m "Scaffold Next.js storefront and Medusa client wrapper"
```

---

### Task 6: Catalog & Product Detail Pages

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
- Create: `apps/storefront/components/CartDrawer.tsx`
- Test: `apps/storefront/lib/cart.test.ts`

**Interfaces:**
- Consumes: `medusa` client (Task 5), `VariantPicker`'s selected variant id (Task 6), zero-stock `basic-hoodie` S variant (Task 2).
- Produces: `getOrCreateCart()`, `addLineItem(cartId, variantId, quantity)` — consumed by Task 9's checkout page.

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter storefront test cart.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement `cart.ts`**

`addLineItem` calls Medusa's cart line-item API, letting Medusa's own inventory check surface the rejection (do not pre-check client-side only). `getOrCreateCart` reads the cart id cookie, fetches the cart, and — if missing or `completed_at` is set — creates a new cart and overwrites the cookie.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter storefront test cart.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/storefront/lib/cart.ts apps/storefront/store/ui-store.ts apps/storefront/components/CartDrawer.tsx apps/storefront/lib/cart.test.ts
git commit -m "Add cart handling with stock and stale-cart checks"
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

### Task 9: Checkout Page + Stripe Elements

**Files:**
- Create: `apps/storefront/app/checkout/page.tsx`
- Create: `apps/storefront/lib/checkout.ts` — `createPaymentSession(cartId)`
- Test: `apps/storefront/app/checkout/checkout-page.test.tsx`

**Interfaces:**
- Consumes: `getOrCreateCart` (Task 7), `useSession` (Task 8), `stripe` payment provider (Task 3).
- Produces: nothing consumed downstream beyond the Stripe payment intent id, read by Task 10's webhook handler from the Stripe event itself.

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter storefront test checkout-page.test.tsx`
Expected: FAIL — page doesn't exist.

- [ ] **Step 3: Implement `checkout.ts` and the checkout page**

Collects shipping address, calls `createPaymentSession(cartId)` (wraps Medusa's payment-collection + initiate-session calls from Task 3), mounts Stripe Elements with the returned client secret. Before rendering Elements, check `cart.items.length`: if zero — which is what an expired/invalid cart cookie becomes once `getOrCreateCart` (Task 7) silently replaces it — redirect to `/` with a `message` query param instead of rendering a payment form for nothing to pay for.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter storefront test checkout-page.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/storefront/app/checkout apps/storefront/lib/checkout.ts
git commit -m "Add checkout page with Stripe Elements"
```

---

### Task 10: Stripe Webhook Handler + Idempotent Order Completion

**Files:**
- Create: `apps/storefront/app/api/webhooks/stripe/route.ts`
- Test: `apps/storefront/app/api/webhooks/stripe/route.test.ts`

**Interfaces:**
- Consumes: Stripe payment intent from Task 9's session.
- Produces: a completed Medusa order — consumed by Task 11's confirmation page via its id.

- [ ] **Step 1: Write the failing test**

```typescript
test("the same webhook event delivered twice completes only one order", async () => {
  const event = buildPaymentIntentSucceededEvent({ payment_intent: "pi_123", cart_id: testCart.id });
  await POST(webhookRequest(event));
  await POST(webhookRequest(event));
  const orders = await adminClient.orders.list({ cart_id: testCart.id });
  expect(orders.length).toBe(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter storefront test route.test.ts`
Expected: FAIL — route doesn't exist.

- [ ] **Step 3: Implement the webhook route**

Before completing the cart, query Medusa for an existing order with `metadata.stripe_payment_intent_id` equal to the event's `payment_intent`; if found, return `200` without completing again. Otherwise complete the cart and set that metadata field on the resulting order. Log the order-placed event server-side (this is the "confirmation email" substitute per spec).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter storefront test route.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/storefront/app/api/webhooks
git commit -m "Add idempotent Stripe webhook handler"
```

---

### Task 11: Order Confirmation Page + Account Page

**Files:**
- Create: `apps/storefront/app/order/[id]/page.tsx`
- Create: `apps/storefront/app/account/page.tsx`
- Test: `apps/storefront/app/order/order-page.test.tsx`

**Interfaces:**
- Consumes: order id (Task 10), `useSession` (Task 8).
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
