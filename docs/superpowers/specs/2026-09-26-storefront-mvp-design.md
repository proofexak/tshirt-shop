# Storefront MVP — Design Spec

## Context

This is the first of several independent sub-projects that make up the
full t-shirt shop (print-on-demand custom designs + premade shirts). The
full project was decomposed at brainstorming time into: **storefront MVP**
(this spec), design customizer, Printful fulfillment integration, and
eventually an admin/inventory layer. Each gets its own spec → plan →
implementation cycle.

## Goal

A real, demoable, sellable storefront for **premade shirts only**: a
shopper can create an account, browse a catalog, add items to a
cart, and pay with a Stripe test card, ending in a real order recorded in
Medusa. No custom-design canvas, no Printful integration, no deployment —
those are separate sub-projects.

## Explicit Non-Goals (this sub-project)

- No design customizer (Konva canvas) — separate sub-project.
- No Printful/fulfillment integration — orders are recorded in Medusa
  only, nothing is sent to a print vendor.
- No *custom* admin UI — the catalog is managed through Medusa's built-in
  admin dashboard plus the seed script (amended 2026-09-27, see
  `2026-09-27-storefront-admin-catalog-design.md`).
- No deployment — runs locally against local Postgres.
- No transactional email — order confirmation is the on-screen page plus
  a server-side log line. Revisit if a later sub-project needs it.
- No Better Auth — Medusa's built-in customer auth (email/password, JWT
  session) covers "must be logged in to buy." Better Auth's actual
  value-adds (passkeys, MFA, no per-MAU cost at scale) aren't needed at
  this stage; swap in later if a sub-project actually requires them.

## Repo Layout

pnpm workspace monorepo:

```
tshirt-shop/
  apps/
    backend/      Medusa (products, customers/auth, carts, orders, Stripe payment module)
    storefront/   Next.js App Router frontend
  docs/
    superpowers/
      specs/
      plans/
```

## Architecture

Next.js talks to Medusa via Medusa's JS SDK. Medusa is the single source
of truth for products, customer accounts, carts, orders, and the Stripe
payment session — it is the only thing that touches Postgres. The
frontend holds no server state of its own beyond TanStack Query's read
cache; Zustand is UI-only state (e.g. whether the cart drawer is open),
never cart line items themselves.

## Components

**`apps/backend` (Medusa)**
- Stripe payment provider plugin configured with test-mode keys.
- Seed script creates the premade products with Size (S–XL) × Colour
  variants and per-colour photos; further products are added through
  Medusa's built-in admin dashboard (see the 2026-09-27 amendment).
- Customer module used as-is for auth (signup, login, JWT session).

**`apps/storefront` (Next.js)**
- Pages: catalog listing, product detail (variant picker), cart,
  checkout, order confirmation, login/signup, minimal account page
  (past orders list only).
- `lib/medusa-client.ts`: thin wrapper around the Medusa JS SDK.
- TanStack Query hooks for product list/detail and cart reads.
- Stripe Elements on the checkout page, driven by the client secret from
  Medusa's payment session.

## Data Flow

1. Browse catalog — SSR/ISR product pages, reading from Medusa.
2. Add to cart — Medusa cart API; cart id stored in an httpOnly cookie.
3. Checkout page collects shipping address, creates a Stripe payment
   session via Medusa.
4. Stripe Elements confirms payment client-side.
5. A Next.js API route receives the Stripe webhook and tells Medusa to
   complete the cart into an order.
6. Confirmation page shows the order; server logs the order-placed event.

## Error Handling

- Expired/invalid cart id → redirect to catalog with a message.
- Failed payment → inline Stripe error message; cart stays intact so the
  shopper can retry.
- Out-of-stock variant → disabled in the UI, driven by Medusa's inventory
  data (not just hidden — must not be selectable).
- Auth errors (wrong password, duplicate email on signup) → inline form
  errors on the relevant field.

## Testing

- Vitest for any client-side calculation logic (e.g. cart totals, if
  computed client-side rather than trusted from Medusa's response).
- One Playwright e2e covering the golden path: browse → sign up → add to
  cart → checkout with a Stripe test card → see confirmation.

## Review Focus (carried into the implementation plan)

- Adding an out-of-stock variant to the cart via a stale page (race
  between page load and stock changing) — cart/checkout must re-validate
  stock server-side, not just disable the button client-side.
- Stripe webhook arriving before the cart-complete request, or twice
  (Stripe redelivery) — order completion must be idempotent on the
  Stripe payment intent id.
- Signup with an email that already exists as a Medusa customer — must
  surface a clear inline error, not a generic 500.
- Cart cookie present but pointing at a cart from a previous, already
  completed order — checkout must detect this and start a fresh cart
  rather than erroring or double-charging.
- Variant picker with a size/design combination that has no matching
  variant (bad seed data or partial stock) — must not be selectable, and
  must not crash the product page.
