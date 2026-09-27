import { execFileSync } from "child_process";
import type { MedusaContainer } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { createShippingProfilesWorkflow } from "@medusajs/medusa/core-flows";

/**
 * Shared workarounds for running `medusaIntegrationTestRunner`
 * (`@medusajs/test-utils`) against this project's local Postgres, which is
 * reached over a unix socket (see CLAUDE.md / task briefs for why). Every
 * spec using that runner needs all three pieces below — import them rather
 * than re-deriving this; it took real debugging to work out.
 *
 * Usage in a spec file:
 *
 *   const TEST_DB_NAME = "medusa_my_spec_test"; // must be unique per spec file
 *
 *   beforeAll(() => {
 *     ensureTestDatabaseWithPgcrypto(TEST_DB_NAME);
 *   });
 *
 *   medusaIntegrationTestRunner({
 *     dbName: TEST_DB_NAME,
 *     hooks: { beforeServerStart: fixSocketDbConnection },
 *     testSuite: ({ api, getContainer }) => {
 *       beforeAll(async () => {
 *         const container = getContainer();
 *         await ensureDefaultShippingProfile(container);
 *         await initialDataSeed({ container });
 *         // ... your own seeding/assertions
 *       });
 *     },
 *   });
 *
 * The 120s test timeout these specs need (a fresh DB + every module's
 * migrations easily takes 15-20s, far more than Jest's 5s hook default) is
 * set globally in jest.config.js instead of per file.
 */

function pgArgs(): string[] {
  const args = ["-h", process.env.DB_HOST!, "-p", process.env.DB_PORT ?? "5432"];
  if (process.env.DB_USERNAME) {
    args.push("-U", process.env.DB_USERNAME);
  }
  return args;
}

/**
 * `medusaIntegrationTestRunner` creates its test database itself (via
 * `CREATE DATABASE`, errorIfExist: false) right before running migrations,
 * with no hook in between to prepare it. PG12 here has no builtin
 * gen_random_uuid(), which a core Medusa migration needs, so pgcrypto must
 * already exist in the database before that happens. Pre-creating the
 * database ourselves and enabling pgcrypto in it means the runner's own
 * `CREATE DATABASE` call is a no-op and migrations find the extension
 * already there.
 *
 * Call this in a `beforeAll`, before `medusaIntegrationTestRunner(...)`,
 * passing the exact same `dbName` you give the runner. Pick a distinct name
 * per spec file — these run against a real local Postgres, so two specs
 * sharing a name will collide (especially if run in parallel).
 */
export function ensureTestDatabaseWithPgcrypto(dbName: string): void {
  try {
    execFileSync("createdb", [...pgArgs(), dbName], { stdio: "pipe" });
  } catch (error: any) {
    const message = error?.stderr?.toString() ?? "";
    if (!message.includes("already exists")) {
      throw error;
    }
  }
  execFileSync(
    "psql",
    [...pgArgs(), "-d", dbName, "-c", "CREATE EXTENSION IF NOT EXISTS pgcrypto;"],
    { stdio: "pipe" }
  );
}

/**
 * `beforeServerStart` hook for `medusaIntegrationTestRunner` that works
 * around two `@medusajs/test-utils` issues hit on this machine's
 * socket-based Postgres setup. Pass it directly as `hooks.beforeServerStart`.
 *
 * 1. Its own `getDatabaseURL()` interpolates `DB_HOST` into the connection
 *    string without percent-encoding it, so a unix socket path (which
 *    contains slashes) produces a malformed URL — the host component ends
 *    at the first "/", and the rest of the socket path becomes part of what
 *    pg's URL parser treats as the path/db name. Repaired here by rewriting
 *    `configModule.projectConfig.databaseUrl` in place.
 * 2. It decides whether to use SSL by checking whether the connection string
 *    contains the literal substring "localhost" — it doesn't recognize a
 *    unix socket path as local, so it defaults to SSL, which the socket
 *    doesn't speak (the same class of trap as the dev server's
 *    DATABASE_URL needing sslmode=disable). Forced off here directly on the
 *    live config object, before the real database connection is made.
 *
 * Both mutations have to happen here, in `beforeServerStart` — it is the
 * one point that runs after `configLoaderOverride` has set (and gotten
 * wrong) `databaseUrl`/`databaseDriverOptions`, but before
 * `initializeDatabase()`/the migrator actually connects using them.
 */
export async function fixSocketDbConnection(
  container: MedusaContainer
): Promise<void> {
  const configModule: any = container.resolve(
    ContainerRegistrationKeys.CONFIG_MODULE
  );
  if (process.env.DB_HOST?.includes("/")) {
    const encodedHost = encodeURIComponent(process.env.DB_HOST);
    configModule.projectConfig.databaseUrl =
      configModule.projectConfig.databaseUrl.replace(
        `@${process.env.DB_HOST}:`,
        `@${encodedHost}:`
      );
  }
  configModule.projectConfig.databaseDriverOptions = {};
}

/**
 * On a real project, a "Default Shipping Profile" already exists by the
 * time `initial-data-seed.ts` runs (created ahead of time by
 * create-medusa-app's own setup, outside of this project's own migrations).
 * A bare test database created by `medusaIntegrationTestRunner` has no such
 * profile, and `initial-data-seed.ts` expects to find one rather than
 * create it. Call this once, after the runner's app has booted and before
 * `initialDataSeed`, to create one if missing.
 */
export async function ensureDefaultShippingProfile(
  container: MedusaContainer
): Promise<void> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
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
}
