import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import initialDataSeed from "../src/migration-scripts/initial-data-seed";
import seedPremadeProducts from "../src/scripts/seed-premade-products";
import {
  ensureTestDatabaseWithPgcrypto,
  fixSocketDbConnection,
  ensureDefaultShippingProfile,
} from "./test-runner-helpers";

// Must be unique across integration-tests/*.spec.ts — see test-runner-helpers.ts.
const TEST_DB_NAME = "medusa_seed_products_test";

function variant(product: any, title: string) {
  const found = product.variants.find((v: any) => v.title === title);
  if (!found) {
    throw new Error(`No variant titled "${title}" on ${product.handle}`);
  }
  return found;
}

beforeAll(() => {
  ensureTestDatabaseWithPgcrypto(TEST_DB_NAME);
});

medusaIntegrationTestRunner({
  dbName: TEST_DB_NAME,
  hooks: {
    beforeServerStart: fixSocketDbConnection,
  },
  testSuite: ({ api, getContainer }) => {
    describe("seed-premade-products", () => {
      let publishableApiKey: string;

      // Medusa's store product route replaces its default field set as
      // soon as any requested field lacks a +/-/* modifier (see
      // @medusajs/framework's FieldParser.shouldReplaceDefaults) — several
      // of the fields the design's exact query string uses (e.g.
      // "thumbnail") do exactly that. `handle`, each option's own
      // id/title, and each variant's own title are all defaults that would
      // otherwise be dropped, but every assertion below needs them, so this
      // helper always requests them alongside whatever the caller asks for.
      async function listStoreProducts(fields: string) {
        const allFields = [
          "handle",
          "options.id",
          "options.title",
          "variants.title",
          fields,
        ].join(",");
        const { data } = await api.get(
          `/store/products?fields=${encodeURIComponent(allFields)}`,
          { headers: { "x-publishable-api-key": publishableApiKey } }
        );
        return data.products;
      }

      beforeAll(async () => {
        const container = getContainer();

        await ensureDefaultShippingProfile(container);

        // Bootstraps store/region/stock-location/shipping (and a
        // publishable API key) the same way Task 1's dev DB was bootstrapped
        // — minus the demo product catalog, which was removed from this
        // script as part of Task 2.
        await initialDataSeed({ container });
        await seedPremadeProducts({ container });

        // A fresh test DB can carry more than one sales channel/publishable
        // key pair (e.g. the test runner's own bootstrap default alongside
        // the one initial-data-seed.ts creates and links to the stock
        // location) — see seed-premade-products.ts's own comment on the
        // same issue. Pick the publishable key actually linked to the sales
        // channel that's linked to the stock location, since that's the
        // channel seedPremadeProducts placed the products in.
        const query = container.resolve(ContainerRegistrationKeys.QUERY);
        const { data: stockLocations } = await query.graph({
          entity: "stock_location",
          fields: ["id"],
        });
        const { data: salesChannels } = await query.graph({
          entity: "sales_channel",
          fields: ["id", "stock_locations.id"],
        });
        const stockedSalesChannel =
          salesChannels.find((sc: any) =>
            (sc.stock_locations ?? []).some(
              (loc: any) => loc.id === stockLocations[0].id
            )
          ) ?? salesChannels[0];
        const { data: apiKeys } = await query.graph({
          entity: "api_key",
          fields: ["id", "token", "type", "sales_channels.id"],
        });
        const key = apiKeys.find(
          (k: any) =>
            k.type === "publishable" &&
            (k.sales_channels ?? []).some(
              (sc: any) => sc.id === stockedSalesChannel.id
            )
        );
        if (!key) {
          throw new Error(
            "No publishable API key linked to the stocked sales channel"
          );
        }
        publishableApiKey = key.token;
      });

      test("seed creates colour x size variants with the deliberate edge cases", async () => {
        const products = await listStoreProducts(
          "*options.values,*variants.options,*variants.images,+variants.inventory_quantity,thumbnail,*images"
        );

        expect(products.map((p: any) => p.handle).sort()).toEqual([
          "basic-hoodie",
          "classic-crew-tee",
          "v-neck-tee",
        ]);

        const byHandle = Object.fromEntries(
          products.map((p: any) => [p.handle, p])
        );

        expect(byHandle["classic-crew-tee"].variants).toHaveLength(8);
        expect(
          byHandle["v-neck-tee"].variants.map((v: any) => v.title)
        ).not.toContain("White / XL");
        expect(byHandle["v-neck-tee"].variants).toHaveLength(7);

        expect(
          variant(byHandle["basic-hoodie"], "Black / S").inventory_quantity
        ).toBe(0);
        expect(
          variant(byHandle["basic-hoodie"], "White / S").inventory_quantity
        ).toBe(10);

        for (const p of products) {
          expect(p.thumbnail).toMatch(/black/);
          const colourOption = p.options.find(
            (o: any) => o.title === "Colour"
          );
          for (const v of p.variants) {
            const colour = v.options
              .find((o: any) => o.option_id === colourOption.id)
              .value.toLowerCase();
            expect(v.images.map((i: any) => i.url).join()).toMatch(
              new RegExp(`${p.handle}-${colour}`)
            );
          }
        }
      });

      test("re-running the seed leaves exactly one product per handle", async () => {
        await seedPremadeProducts({ container: getContainer() });

        const products = await listStoreProducts("id");
        expect(products).toHaveLength(3);
      });
    });
  },
});
