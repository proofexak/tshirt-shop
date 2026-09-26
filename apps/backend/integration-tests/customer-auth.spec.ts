import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { Modules } from "@medusajs/framework/utils";
import initialDataSeed from "../src/migration-scripts/initial-data-seed";
import {
  ensureTestDatabaseWithPgcrypto,
  fixSocketDbConnection,
  ensureDefaultShippingProfile,
} from "./test-runner-helpers";

// Must be unique across integration-tests/*.spec.ts — see test-runner-helpers.ts.
const TEST_DB_NAME = "medusa_customer_auth_test";

beforeAll(() => {
  ensureTestDatabaseWithPgcrypto(TEST_DB_NAME);
});

medusaIntegrationTestRunner({
  dbName: TEST_DB_NAME,
  hooks: {
    beforeServerStart: fixSocketDbConnection,
  },
  testSuite: ({ api, getContainer }) => {
    describe("customer auth", () => {
      let publishableApiKey: string;

      beforeAll(async () => {
        const container = getContainer();

        await ensureDefaultShippingProfile(container);
        await initialDataSeed({ container });

        const apiKeyModuleService = container.resolve(Modules.API_KEY);
        const [key] = await apiKeyModuleService.listApiKeys({
          type: "publishable",
        });
        publishableApiKey = key.token;
      });

      const storeHeaders = () => ({
        "x-publishable-api-key": publishableApiKey,
      });

      /**
       * Medusa v2's customer signup is a three-call sequence — register alone
       * creates only an auth identity, with no customer record attached:
       *
       *   1. POST /auth/customer/emailpass/register — creates the auth
       *      identity, returns { token } (an "actorless" token: valid enough
       *      to create a customer, not yet tied to one).
       *   2. POST /store/customers, Authorization: Bearer <that token> —
       *      creates the customer record and attaches it to the auth
       *      identity. Returns { customer }.
       *   3. POST /auth/customer/emailpass (login), same email/password —
       *      returns { token }, this time with the customer as its actor.
       *
       * authClient below performs this whole sequence and returns the final
       * (customer-bound) login token, matching what the brief's
       * `authClient.register(...)` is meant to do.
       */
      const authClient = {
        registerRaw: async (email: string, password: string) => {
          try {
            const res = await api.post("/auth/customer/emailpass/register", {
              email,
              password,
            });
            return { status: res.status, body: res.data };
          } catch (error: any) {
            if (error.response) {
              return { status: error.response.status, body: error.response.data };
            }
            throw error;
          }
        },
        register: async (email: string, password: string) => {
          const registerRes = await api.post(
            "/auth/customer/emailpass/register",
            { email, password }
          );
          const registrationToken = registerRes.data.token;

          await api.post(
            "/store/customers",
            { email },
            {
              headers: {
                authorization: `Bearer ${registrationToken}`,
                ...storeHeaders(),
              },
            }
          );

          const loginRes = await api.post("/auth/customer/emailpass", {
            email,
            password,
          });

          return { token: loginRes.data.token as string };
        },
      };

      const storeClient = {
        customers: {
          me: async ({
            headers,
          }: {
            headers: Record<string, string>;
          }) => {
            const res = await api.get("/store/customers/me", {
              headers: { ...storeHeaders(), ...headers },
            });
            return res.data.customer;
          },
        },
      };

      test("register then fetch own customer record", async () => {
        const { token } = await authClient.register(
          "shopper@example.com",
          "pass1234"
        );
        const me = await storeClient.customers.me({
          headers: { authorization: `Bearer ${token}` },
        });
        expect(me.email).toBe("shopper@example.com");
      });

      test("registering a duplicate email returns a 4xx with an identifiable error", async () => {
        await authClient.register("dup@example.com", "pass1234");
        const res = await authClient.registerRaw("dup@example.com", "pass1234");
        expect(res.status).toBeGreaterThanOrEqual(400);
        expect(res.status).toBeLessThan(500);
        expect(res.body.message).toMatch(/already exists|already registered/i);
      });
    });
  },
});
