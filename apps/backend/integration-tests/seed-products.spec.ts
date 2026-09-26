import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { Modules } from "@medusajs/framework/utils";
import initialDataSeed from "../src/migration-scripts/initial-data-seed";
import seedPremadeProducts from "../src/scripts/seed-premade-products";
import {
  ensureTestDatabaseWithPgcrypto,
  fixSocketDbConnection,
  ensureDefaultShippingProfile,
} from "./test-runner-helpers";

// Must be unique across integration-tests/*.spec.ts — see test-runner-helpers.ts.
const TEST_DB_NAME = "medusa_seed_products_test";

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

      beforeAll(async () => {
        const container = getContainer();

        await ensureDefaultShippingProfile(container);

        // Bootstraps store/region/stock-location/shipping (and a
        // publishable API key) the same way Task 1's dev DB was bootstrapped
        // — minus the demo product catalog, which was removed from this
        // script as part of this task.
        await initialDataSeed({ container });
        await seedPremadeProducts({ container });

        const apiKeyModuleService = container.resolve(Modules.API_KEY);
        const [key] = await apiKeyModuleService.listApiKeys({
          type: "publishable",
        });
        publishableApiKey = key.token;
      });

      test("seed creates the expected catalog", async () => {
        const { data } = await api.get(
          "/store/products?fields=+variants.inventory_quantity",
          { headers: { "x-publishable-api-key": publishableApiKey } }
        );

        const handles = data.products.map((p: any) => p.handle).sort();
        expect(handles).toEqual([
          "basic-hoodie",
          "classic-crew-tee",
          "v-neck-tee",
        ]);

        const hoodie = data.products.find(
          (p: any) => p.handle === "basic-hoodie"
        );
        const sizeS = hoodie.variants.find((v: any) => v.title === "S");
        expect(sizeS.inventory_quantity).toBe(0);
      });
    });
  },
});
