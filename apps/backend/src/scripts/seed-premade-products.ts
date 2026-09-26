import { MedusaContainer } from "@medusajs/framework";
import {
  ContainerRegistrationKeys,
  ProductStatus,
} from "@medusajs/framework/utils";
import {
  createInventoryLevelsWorkflow,
  createProductsWorkflow,
} from "@medusajs/medusa/core-flows";

const SIZES = ["S", "M", "L", "XL"] as const;

const PRODUCTS = [
  { handle: "classic-crew-tee", title: "Classic Crew Tee" },
  { handle: "v-neck-tee", title: "V-Neck Tee" },
  { handle: "basic-hoodie", title: "Basic Hoodie" },
] as const;

const DEFAULT_QUANTITY = 10;
// The deliberate out-of-stock case used by Tasks 6 and 7.
const ZERO_STOCK_HANDLE = "basic-hoodie";
const ZERO_STOCK_SIZE = "S";
const PRICE_AMOUNT = 20;

export default async function seedPremadeProducts({
  container,
}: {
  container: MedusaContainer;
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  const { data: salesChannels } = await query.graph({
    entity: "sales_channel",
    fields: ["id"],
  });
  const salesChannel = salesChannels[0];

  const { data: stockLocations } = await query.graph({
    entity: "stock_location",
    fields: ["id"],
  });
  const stockLocation = stockLocations[0];

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

  logger.info("Seeding premade product catalog...");

  await createProductsWorkflow(container).run({
    input: {
      products: PRODUCTS.map(({ handle, title }) => ({
        title,
        handle,
        status: ProductStatus.PUBLISHED,
        shipping_profile_id: shippingProfile.id,
        options: [
          {
            title: "Size",
            values: [...SIZES],
          },
        ],
        variants: SIZES.map((size) => ({
          title: size,
          sku: `${handle}-${size}`.toUpperCase(),
          manage_inventory: true,
          options: { Size: size },
          prices: [
            {
              amount: PRICE_AMOUNT,
              currency_code: region.currency_code,
            },
          ],
        })),
        sales_channels: [{ id: salesChannel.id }],
      })),
    },
  });

  logger.info("Finished creating premade products. Seeding inventory levels...");

  const { data: createdProducts } = await query.graph({
    entity: "product",
    fields: [
      "handle",
      "variants.title",
      "variants.inventory_items.inventory_item_id",
    ],
    filters: { handle: PRODUCTS.map((p) => p.handle) },
  });

  const inventoryLevels = createdProducts.flatMap((product) =>
    (product.variants ?? []).flatMap((variant) => {
      const inventoryItemId = variant.inventory_items?.[0]?.inventory_item_id;
      if (!inventoryItemId) {
        return [];
      }
      const isZeroStockVariant =
        product.handle === ZERO_STOCK_HANDLE &&
        variant.title === ZERO_STOCK_SIZE;
      return [
        {
          location_id: stockLocation.id,
          inventory_item_id: inventoryItemId,
          stocked_quantity: isZeroStockVariant ? 0 : DEFAULT_QUANTITY,
        },
      ];
    })
  );

  await createInventoryLevelsWorkflow(container).run({
    input: { inventory_levels: inventoryLevels },
  });

  logger.info("Finished seeding premade product catalog.");
}
