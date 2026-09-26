import { execFileSync } from "child_process";
import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { createShippingProfilesWorkflow } from "@medusajs/medusa/core-flows";
import initialDataSeed from "../src/migration-scripts/initial-data-seed";
import seedPremadeProducts from "../src/scripts/seed-premade-products";

// Jest's default 5s hook timeout is far too short for medusaIntegrationTestRunner's
// beforeAll, which creates a fresh database and runs every module's migrations —
// tens of seconds even on a fast machine. A too-short timeout doesn't just fail
// the test — Jest aborts mid-migration, which the database sees as a killed
// connection ("terminating connection due to administrator command"),
// potentially leaving the schema half-migrated.
jest.setTimeout(120000);

const TEST_DB_NAME = "medusa_seed_products_test";

// @medusajs/test-utils creates its test database itself (via `CREATE
// DATABASE`, errorIfExist: false) right before running migrations, with no
// hook in between to prepare it. PG12 here has no builtin gen_random_uuid(),
// which a core Medusa migration needs, so pgcrypto must already exist in the
// database before that happens. Pre-creating the (deterministically named)
// database ourselves and enabling pgcrypto in it means the runner's own
// `CREATE DATABASE IF NOT EXISTS`-equivalent is a no-op and migrations find
// the extension already there.
function pgArgs(): string[] {
  const args = ["-h", process.env.DB_HOST!, "-p", process.env.DB_PORT ?? "5432"];
  if (process.env.DB_USERNAME) {
    args.push("-U", process.env.DB_USERNAME);
  }
  return args;
}

function ensureTestDatabaseWithPgcrypto() {
  try {
    execFileSync("createdb", [...pgArgs(), TEST_DB_NAME], { stdio: "pipe" });
  } catch (error: any) {
    const message = error?.stderr?.toString() ?? "";
    if (!message.includes("already exists")) {
      throw error;
    }
  }
  execFileSync(
    "psql",
    [...pgArgs(), "-d", TEST_DB_NAME, "-c", "CREATE EXTENSION IF NOT EXISTS pgcrypto;"],
    { stdio: "pipe" }
  );
}

beforeAll(() => {
  ensureTestDatabaseWithPgcrypto();
});

medusaIntegrationTestRunner({
  dbName: TEST_DB_NAME,
  hooks: {
    beforeServerStart: async (container) => {
      // @medusajs/test-utils decides whether to use SSL by checking whether
      // the database clientUrl string contains "localhost" — it doesn't
      // recognize a unix socket path as local, so it defaults to SSL, which
      // the socket doesn't speak (this is the same class of trap as the dev
      // server's DATABASE_URL needing sslmode=disable). Force it off
      // directly on the live config object before the app connects.
      const configModule: any = container.resolve(
        ContainerRegistrationKeys.CONFIG_MODULE
      );
      // @medusajs/test-utils' own getDatabaseURL() interpolates DB_HOST into
      // the connection string without percent-encoding it, so a unix socket
      // path (which contains slashes) produces a malformed URL — the host
      // component ends at the first "/", and the rest of the socket path
      // becomes part of what pg's URL parser treats as the path/db name.
      // Repair it here, and force SSL off (see comment above) before the
      // real database connection is made.
      if (process.env.DB_HOST?.includes("/")) {
        const encodedHost = encodeURIComponent(process.env.DB_HOST);
        configModule.projectConfig.databaseUrl =
          configModule.projectConfig.databaseUrl.replace(
            `@${process.env.DB_HOST}:`,
            `@${encodedHost}:`
          );
      }
      configModule.projectConfig.databaseDriverOptions = {};
    },
  },
  testSuite: ({ api, getContainer }) => {
    describe("seed-premade-products", () => {
      let publishableApiKey: string;

      beforeAll(async () => {
        const container = getContainer();
        const query = container.resolve(ContainerRegistrationKeys.QUERY);

        // On a real project, a "Default Shipping Profile" already exists by
        // the time initial-data-seed runs (created ahead of time by
        // create-medusa-app's own setup, outside of this project's own
        // migrations). A bare test database has no such profile, and
        // initial-data-seed expects to find one rather than create it — so
        // create it here, the same way the test creates the publishable API
        // key the store API needs but a fresh DB doesn't have yet.
        const { data: existingShippingProfiles } = await query.graph({
          entity: "shipping_profile",
          fields: ["id"],
        });
        if (existingShippingProfiles.length === 0) {
          await createShippingProfilesWorkflow(container).run({
            input: {
              data: [{ name: "Default Shipping Profile", type: "default" }],
            },
          });
        }

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
