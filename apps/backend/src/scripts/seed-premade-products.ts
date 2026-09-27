import { readFileSync } from "node:fs";
import path from "node:path";
import { MedusaContainer } from "@medusajs/framework";
import {
  ContainerRegistrationKeys,
  ProductStatus,
} from "@medusajs/framework/utils";
import {
  batchVariantImagesWorkflow,
  createInventoryLevelsWorkflow,
  createProductsWorkflow,
  deleteProductsWorkflow,
  deleteReservationsWorkflow,
  uploadFilesWorkflow,
} from "@medusajs/medusa/core-flows";

const SIZES = ["S", "M", "L", "XL"] as const;
const COLOURS = ["Black", "White"] as const;

// Every product gets Size x Colour, except for the two deliberate edge
// cases below (Tasks 6/7/12/15 depend on these by name):
// - basic-hoodie Black/S is in stock 0 (out-of-stock case).
// - v-neck-tee has no White/XL variant at all (no-matching-variant case).
const PRODUCTS = [
  { handle: "classic-crew-tee", title: "Classic Crew Tee" },
  { handle: "v-neck-tee", title: "V-Neck Tee" },
  { handle: "basic-hoodie", title: "Basic Hoodie" },
] as const;

const DEFAULT_QUANTITY = 10;
const ZERO_STOCK_HANDLE = "basic-hoodie";
const ZERO_STOCK_VARIANT_TITLE = "Black / S";
const MISSING_VARIANT_HANDLE = "v-neck-tee";
const MISSING_VARIANT_TITLE = "White / XL";
const PRICE_AMOUNT = 20;

const SEED_ASSETS_DIR = path.resolve(process.cwd(), "seed-assets");

function variantsFor(handle: string) {
  return COLOURS.flatMap((colour) =>
    SIZES.filter(
      (size) =>
        !(
          handle === MISSING_VARIANT_HANDLE &&
          `${colour} / ${size}` === MISSING_VARIANT_TITLE
        )
    ).map((size) => ({ colour, size }))
  );
}

export default async function seedPremadeProducts({
  container,
}: {
  container: MedusaContainer;
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  const { data: stockLocations } = await query.graph({
    entity: "stock_location",
    fields: ["id"],
  });
  const stockLocation = stockLocations[0];

  // Pick the sales channel actually linked to that stock location (rather
  // than assuming index 0), since a fresh DB can carry more than one sales
  // channel — e.g. Medusa's own bootstrap "Default Sales Channel" alongside
  // the one initial-data-seed.ts creates and links to both the stock
  // location and the publishable API key. A product placed in a channel
  // that isn't linked to any stock location always reports 0 quantity via
  // the store API, regardless of its real inventory levels.
  const { data: salesChannels } = await query.graph({
    entity: "sales_channel",
    fields: ["id", "stock_locations.id"],
  });
  const salesChannel = salesChannels.find((sc) =>
    (sc.stock_locations ?? []).some((loc) => loc?.id === stockLocation.id)
  );
  if (!salesChannel) {
    throw new Error(
      `No sales channel is linked to stock location ${stockLocation.id}. ` +
        `Found ${salesChannels.length} sales channel(s): ${salesChannels
          .map((sc) => sc.id)
          .join(", ")}. Seeding into an unlinked channel would silently ` +
        `report 0 stock via the store API regardless of real inventory — ` +
        `link a sales channel to this stock location before re-running.`
    );
  }

  const { data: shippingProfiles } = await query.graph({
    entity: "shipping_profile",
    fields: ["id"],
  });
  const shippingProfile = shippingProfiles[0];

  const { data: regions } = await query.graph({
    entity: "region",
    fields: ["id", "currency_code"],
  });
  const region = regions[0];

  // Delete any existing premade products first (soft delete, via Medusa's
  // own workflow) so the seed can be re-run to migrate the local dev DB in
  // place. Past orders are unaffected — their line items are snapshots.
  const { data: existingProducts } = await query.graph({
    entity: "product",
    fields: ["id", "variants.inventory_items.inventory_item_id"],
    filters: { handle: PRODUCTS.map((p) => p.handle) },
  });
  if (existingProducts.length > 0) {
    // deleteProductsWorkflow also deletes the inventory items backing each
    // variant it removes, and refuses to delete one that still has open
    // reservations. A dev DB that has had real (test) orders placed against
    // this catalog can have exactly that: reservations tied to those old
    // orders' line items that were never released. Clear them first — this
    // only removes inventory-side bookkeeping, not the orders themselves,
    // whose line items are immutable snapshots regardless.
    const existingInventoryItemIds = existingProducts.flatMap((product) =>
      (product.variants ?? []).flatMap((variant) =>
        (variant.inventory_items ?? [])
          .map((item) => item?.inventory_item_id)
          .filter((id): id is string => !!id)
      )
    );
    if (existingInventoryItemIds.length > 0) {
      const { data: existingReservations } = await query.graph({
        entity: "reservation_item",
        fields: ["id"],
        filters: { inventory_item_id: existingInventoryItemIds },
      });
      if (existingReservations.length > 0) {
        logger.info(
          `Releasing ${existingReservations.length} stale reservation(s) on the previous catalog...`
        );
        await deleteReservationsWorkflow(container).run({
          input: { ids: existingReservations.map((r) => r.id) },
        });
      }
    }

    logger.info(
      `Deleting ${existingProducts.length} existing premade product(s)...`
    );
    await deleteProductsWorkflow(container).run({
      input: { ids: existingProducts.map((p) => p.id) },
    });
  }

  logger.info("Uploading seed placeholder photos...");

  const uploadInput = PRODUCTS.flatMap(({ handle }) =>
    COLOURS.map((colour) => {
      const filename = `${handle}-${colour.toLowerCase()}.png`;
      const content = readFileSync(
        path.join(SEED_ASSETS_DIR, filename)
      ).toString("base64");
      return {
        filename,
        mimeType: "image/png",
        content,
        access: "public" as const,
        handle,
        colour,
      };
    })
  );

  const { result: uploadedFiles } = await uploadFilesWorkflow(container).run({
    input: {
      files: uploadInput.map(({ filename, mimeType, content, access }) => ({
        filename,
        mimeType,
        content,
        access,
      })),
    },
  });

  // handle -> colour -> uploaded image URL
  const imageUrlsByHandle = new Map<string, Map<string, string>>();
  uploadInput.forEach(({ handle, colour }, index) => {
    const url = uploadedFiles[index].url;
    if (!imageUrlsByHandle.has(handle)) {
      imageUrlsByHandle.set(handle, new Map());
    }
    imageUrlsByHandle.get(handle)!.set(colour, url);
  });

  logger.info("Seeding premade product catalog...");

  await createProductsWorkflow(container).run({
    input: {
      products: PRODUCTS.map(({ handle, title }) => {
        const colourUrls = imageUrlsByHandle.get(handle)!;
        const blackUrl = colourUrls.get("Black")!;
        const whiteUrl = colourUrls.get("White")!;

        return {
          title,
          handle,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfile.id,
          thumbnail: blackUrl,
          images: [{ url: blackUrl }, { url: whiteUrl }],
          options: [
            { title: "Size", values: [...SIZES] },
            { title: "Colour", values: [...COLOURS] },
          ],
          variants: variantsFor(handle).map(({ colour, size }) => ({
            title: `${colour} / ${size}`,
            sku: `${handle}-${colour}-${size}`.toUpperCase(),
            manage_inventory: true,
            options: { Size: size, Colour: colour },
            prices: [
              {
                amount: PRICE_AMOUNT,
                currency_code: region.currency_code,
              },
            ],
          })),
          sales_channels: [{ id: salesChannel.id }],
        };
      }),
    },
  });

  logger.info(
    "Finished creating premade products. Linking variant images and seeding inventory..."
  );

  const { data: createdProducts } = await query.graph({
    entity: "product",
    fields: [
      "handle",
      "images.id",
      "images.url",
      "variants.id",
      "variants.title",
      "variants.inventory_items.inventory_item_id",
    ],
    filters: { handle: PRODUCTS.map((p) => p.handle) },
  });

  const inventoryLevels: {
    location_id: string;
    inventory_item_id: string;
    stocked_quantity: number;
  }[] = [];

  for (const product of createdProducts) {
    const colourUrls = imageUrlsByHandle.get(product.handle)!;
    const imageIdByUrl = new Map(
      (product.images ?? []).map((image) => [image.url, image.id])
    );
    const imageIdByColour = new Map<string, string>(
      COLOURS.map((colour) => {
        const url = colourUrls.get(colour);
        const imageId = url ? imageIdByUrl.get(url) : undefined;
        if (!imageId) {
          throw new Error(
            `No uploaded image found for ${product.handle} / ${colour}. ` +
              `Expected the product's images to include the URL uploaded ` +
              `for this colour.`
          );
        }
        return [colour, imageId];
      })
    );

    for (const variant of product.variants ?? []) {
      const [colour] = variant.title.split(" / ");
      const imageId = imageIdByColour.get(colour);
      if (!imageId) {
        throw new Error(
          `Variant "${variant.title}" on ${product.handle} has an ` +
            `unrecognised colour "${colour}" — expected one of: ${COLOURS.join(", ")}.`
        );
      }
      await batchVariantImagesWorkflow(container).run({
        input: { variant_id: variant.id, add: [imageId] },
      });

      const inventoryItemId = variant.inventory_items?.[0]?.inventory_item_id;
      if (!inventoryItemId) {
        continue;
      }
      const isZeroStockVariant =
        product.handle === ZERO_STOCK_HANDLE &&
        variant.title === ZERO_STOCK_VARIANT_TITLE;
      inventoryLevels.push({
        location_id: stockLocation.id,
        inventory_item_id: inventoryItemId,
        stocked_quantity: isZeroStockVariant ? 0 : DEFAULT_QUANTITY,
      });
    }
  }

  await createInventoryLevelsWorkflow(container).run({
    input: { inventory_levels: inventoryLevels },
  });

  logger.info("Finished seeding premade product catalog.");
}
