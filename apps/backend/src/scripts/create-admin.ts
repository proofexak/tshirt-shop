import { MedusaContainer } from "@medusajs/framework";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { createUsersWorkflow } from "@medusajs/medusa/core-flows";

/**
 * Creates a single admin (dashboard) user with an emailpass auth identity,
 * reusing the same building blocks `@medusajs/medusa`'s own `medusa user`
 * CLI command uses under the hood (see
 * `@medusajs/medusa/dist/commands/user.js`):
 *
 *   1. `createUsersWorkflow` (from `@medusajs/medusa/core-flows`) to create
 *      the `user` row.
 *   2. The Auth module's `register("emailpass", ...)` to create the auth
 *      identity holding the hashed password.
 *   3. `updateAuthIdentities` to link that auth identity to the user via
 *      `app_metadata.user_id`, which is what the emailpass auth provider
 *      checks on login.
 *
 * Idempotent: if a user with this email already exists, no new user or auth
 * identity is created and `{ created: false }` is returned.
 */
export async function createAdminUser(
  container: MedusaContainer,
  input: { email: string; password: string }
): Promise<{ userId: string; created: boolean }> {
  const userModuleService = container.resolve(Modules.USER);
  const authModuleService = container.resolve(Modules.AUTH);

  const [existingUser] = await userModuleService.listUsers({
    email: input.email,
  });

  if (existingUser) {
    return { userId: existingUser.id, created: false };
  }

  const {
    result: [user],
  } = await createUsersWorkflow(container).run({
    input: { users: [{ email: input.email }] },
  });

  const { authIdentity, error } = await authModuleService.register(
    "emailpass",
    { body: { email: input.email, password: input.password } }
  );

  if (error) {
    throw new Error(error);
  }

  await authModuleService.updateAuthIdentities({
    id: authIdentity!.id,
    app_metadata: { user_id: user.id },
  });

  return { userId: user.id, created: true };
}

/**
 * `medusa exec` entry point: reads the admin account's credentials from the
 * environment (never invent or hardcode them — they belong to whoever runs
 * this) and creates the account if it doesn't already exist.
 *
 * Usage: `pnpm --filter backend admin:create`
 */
export default async function createAdmin({
  container,
}: {
  container: MedusaContainer;
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);

  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    logger.error(
      "ADMIN_EMAIL and ADMIN_PASSWORD must both be set (in apps/backend/.env) to create the admin user."
    );
    process.exit(1);
  }

  const { userId, created } = await createAdminUser(container, {
    email,
    password,
  });

  if (created) {
    logger.info(`Admin user created: ${email} (${userId})`);
  } else {
    logger.info(`Admin user already exists: ${email} (${userId})`);
  }
}
