# Storefront MVP Amendment — Admin Dashboard, Colours & Photos

Amends: `docs/superpowers/specs/2026-09-26-storefront-mvp-design.md`

## Context

The storefront MVP spec made the catalog fixed: seeded by script, with no
admin UI. That rule is relaxed. The shop owner wants to add and edit shirts
(photos and colours included) without writing code. This amendment covers
three things:

- enabling Medusa's built-in admin dashboard for that purpose;
- re-seeding the premade catalog with colours and photos;
- making the storefront handle whatever product shapes the admin can create.

It is added to the current MVP plan rather than split into a separate
sub-project.

## Goal

The owner logs in at `http://localhost:9000/app` and creates a t-shirt with
title, description, EUR price, Size and Colour options, per-variant stock,
and photos (each variant linked to its colour's photo). Once published, the
shirt appears in the storefront catalog. Shoppers see the right photo for the
colour they pick and can buy any in-stock size/colour combination.

## Decisions

- **Built-in dashboard, unmodified.** No custom admin pages, widgets or
  hidden sections. The dashboard also exposes orders and customers, but
  nothing in the storefront depends on that.
- **One admin account**, created by a committed script
  (`pnpm --filter backend admin:create`, wrapping `medusa user`). It reads
  `ADMIN_EMAIL` / `ADMIN_PASSWORD` from the backend `.env`. `.env.example`
  gets empty placeholders, and credentials are never committed.
- **Photos use Medusa's local file provider** (`@medusajs/file-local`).
  Uploads are stored in `apps/backend/static/` (gitignored runtime data) and
  served from `http://localhost:9000/static/...`.
- **Colours and sizes are ordinary Medusa product options.** Sizes stay
  S–XL in the seed, but the storefront doesn't assume that. It renders
  whatever options a product has.
- **Photos are per colour.** Each variant is linked to its colour's product
  image through Medusa's native variant images. The product thumbnail is its
  Black image.
- **Checklist for admin-created products** (documented in the README, since
  the storefront can't enforce it): the product must be **published**, be in
  the **Default Sales Channel**, and have a **EUR price**. The dashboard's
  defaults cover the first two, and price is a required field.

## Seeded Catalog (replaces Task 2's catalog shape)

The handles stay the same: `classic-crew-tee`, `v-neck-tee`, `basic-hoodie`.
Each product has:

- Option **Size**: `S`, `M`, `L`, `XL`
- Option **Colour**: `Black`, `White`
- Variants titled `"<Colour> / <Size>"` (e.g. `Black / M`), stock 10 each.

Deliberate edge cases (later tasks depend on these by name):

- **Out of stock:** `basic-hoodie` **Black / S** has stock `0`.
- **No matching variant:** `v-neck-tee` has **no `White / XL` variant**.

Photos: 6 committed placeholder PNGs (3 products × 2 colours). Each is a flat
shirt silhouette in that colour, labelled with the product name. They are
generated once by a small committed script and live in
`apps/backend/seed-assets/`. The seed uploads them through the file module,
attaches them as product images, links each variant to its colour's image,
and sets the thumbnail.

The seed can be re-run by handle. An existing premade product is deleted
through Medusa and recreated, so the local dev DB can be migrated in place.
Past orders are unaffected because line items are snapshots.

## Storefront Changes

**`VariantPicker`** changes from a fixed S–XL row to an option-driven
component. Its props become
`{ options, variants, onSelect(variantId | null) }`.

- It renders one labelled button group per product option, in Medusa's
  order. Each button's accessible name is the option value (e.g. `Black`,
  `M`). Size values sort S → M → L → XL; other values keep Medusa's order.
- A value is **disabled** if no in-stock variant matches it together with
  the other current selections. Disabled means not selectable, not hidden.
- An option with exactly one value is pre-selected; nothing else is. If a
  new selection makes an earlier one impossible, the earlier one is cleared.
- `onSelect(variantId)` fires only when every option has a value and the
  combination matches an in-stock variant. Otherwise it fires
  `onSelect(null)`, and "Add to cart" stays disabled. Medusa's server-side
  stock check remains the authority when adding to cart.

**Product page photo:** the image linked to a variant matching the current
selection, e.g. choosing White shows the white shirt. If none is available
it falls back to the product thumbnail, then the first product image, then a
neutral placeholder box.

**Catalog page:** each product card shows its thumbnail (or the placeholder
box) above the title link. The link's accessible name stays exactly the
product title.

**Data:** the product hooks additionally request `thumbnail`, `*images`,
`*options.values`, `*variants.options` and `*variants.images`. Images render
with `next/image`. `remotePatterns` allows the backend host derived from
`NEXT_PUBLIC_MEDUSA_BACKEND_URL`.

**Cart drawer:** shows each line's variant title (e.g. `Black / M`).

## Error Handling

- Missing or failed images: the placeholder box (via `next/image`
  `onError`); the page never breaks.
- An admin-created product with no variants, or none in stock: every choice
  is disabled and "Add to cart" is disabled. No crash.
- A product with only Medusa's default option (one value): that value is
  pre-selected, so the product can be added directly.
- A product with no EUR price: shows "Price unavailable" and "Add to cart" is
  disabled. This makes a missed checklist item visible.

## Testing

- **Backend:**
  - The seed test is rewritten. It asserts colour × size variants,
    `basic-hoodie` Black/S stock 0, `v-neck-tee` has no White/XL, and each
    variant is linked to its colour's image.
  - A new integration test covers the admin path end to end: create the admin
    via the script's logic, authenticate at `/auth/user/emailpass`, upload an
    image and create a published, EUR-priced product through the admin API,
    then confirm the store API returns it with its image.
- **Storefront:**
  - `VariantPicker` tests cover: per-option groups; v-neck White → XL
    disabled; hoodie Black → S disabled; single-value pre-selection;
    `onSelect(null)` until complete; clearing of an invalidated selection.
  - The product page photo swaps with colour, and catalog cards show
    thumbnails.
  - Task 7's product-page/cart tests change from selecting `M` to `Black` +
    `M`. Its live-backend fixture changes from choosing a variant by title
    `L` to choosing one by option values.
- **E2E (Task 12):** after opening Classic Crew Tee, click `Black`, then
  `M`, then "Add to cart".

## Out of Scope

Custom admin UI; roles and permissions or multiple admins; colour swatches;
image zoom and galleries; catalog filtering; image resizing/CDN; S3/R2
storage (a later sub-project); sizes beyond S–XL in the seed.
