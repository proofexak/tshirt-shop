import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import type { MedusaContainer } from "@medusajs/framework";
import { Modules } from "@medusajs/framework/utils";
import initialDataSeed from "../src/migration-scripts/initial-data-seed";
import { createAdminUser } from "../src/scripts/create-admin";
import {
  ensureTestDatabaseWithPgcrypto,
  fixSocketDbConnection,
  ensureDefaultShippingProfile,
} from "./test-runner-helpers";

// Must be unique across integration-tests/*.spec.ts — see test-runner-helpers.ts.
const TEST_DB_NAME = "medusa_admin_catalog_test";

// A minimal valid 1x1 transparent PNG, generated here rather than committed
// as a fixture file, to exercise the real /admin/uploads pipeline.
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

beforeAll(() => {
  ensureTestDatabaseWithPgcrypto(TEST_DB_NAME);
});

medusaIntegrationTestRunner({
  dbName: TEST_DB_NAME,
  hooks: {
    beforeServerStart: fixSocketDbConnection,
  },
  testSuite: ({ api, getContainer }) => {
    describe("admin dashboard access & file storage", () => {
      let container: MedusaContainer;
      let publishableApiKey: string;
      let defaultSalesChannelId: string;

      beforeAll(async () => {
        container = getContainer();

        await ensureDefaultShippingProfile(container);
        await initialDataSeed({ container });

        const apiKeyModuleService = container.resolve(Modules.API_KEY);
        const [key] = await apiKeyModuleService.listApiKeys({
          type: "publishable",
        });
        publishableApiKey = key.token;

        const salesChannelModuleService = container.resolve(
          Modules.SALES_CHANNEL
        );
        const [defaultSalesChannel] =
          await salesChannelModuleService.listSalesChannels({
            name: "Default Sales Channel",
          });
        defaultSalesChannelId = defaultSalesChannel.id;
      });

      test("createAdminUser is idempotent", async () => {
        const first = await createAdminUser(container, {
          email: "owner@example.com",
          password: "admin1234",
        });
        const second = await createAdminUser(container, {
          email: "owner@example.com",
          password: "admin1234",
        });

        expect(first.created).toBe(true);
        expect(second).toEqual({ userId: first.userId, created: false });
      });

      test("an admin-created product with an image is visible in the store API", async () => {
        await createAdminUser(container, {
          email: "catalog-admin@example.com",
          password: "admin1234",
        });

        const loginRes = await api.post("/auth/user/emailpass", {
          email: "catalog-admin@example.com",
          password: "admin1234",
        });
        const adminHeaders = {
          Authorization: `Bearer ${loginRes.data.token}`,
        };

        const formData = new FormData();
        formData.append(
          "files",
          new Blob([Buffer.from(TINY_PNG_BASE64, "base64")], {
            type: "image/png",
          }),
          "test.png"
        );
        const uploadRes = await api.post("/admin/uploads", formData, {
          headers: adminHeaders,
        });
        const uploadedUrl = uploadRes.data.files[0].url as string;

        expect(uploadedUrl).toMatch(/^http:\/\/localhost:9000\/static\//);

        await api.post(
          "/admin/products",
          {
            title: "Test Tee",
            handle: "test-tee",
            status: "published",
            images: [{ url: uploadedUrl }],
            options: [{ title: "Size", values: ["M"] }],
            variants: [
              {
                title: "M",
                options: { Size: "M" },
                prices: [{ currency_code: "eur", amount: 25 }],
              },
            ],
            sales_channels: [{ id: defaultSalesChannelId }],
          },
          { headers: adminHeaders }
        );

        const { data } = await api.get(
          "/store/products?handle=test-tee&fields=*images",
          { headers: { "x-publishable-api-key": publishableApiKey } }
        );

        expect(data.products).toHaveLength(1);
        expect(data.products[0].images[0].url).toBe(uploadedUrl);
      });
    });
  },
});
