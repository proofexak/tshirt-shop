// Runs against the LIVE local Medusa backend (same reasoning as
// lib/cart.test.ts) — the round-1 review's dangling-identity bug is a real
// interaction between /auth/customer/emailpass/register,
// /store/customers, and /auth/customer/emailpass, and a mocked client
// can't prove Medusa's actual behavior for the specific case that matters
// here (a login token for an identity with no customer attached). See
// ./test-support/live-backend-env.ts for why this import must come first.
import "./test-support/live-backend-env";

import { beforeAll, describe, expect, test } from "vitest";
import { medusa } from "./medusa-client";
import { fetchSessionCustomer, loginCustomer, signupCustomer } from "./auth-server";

const BACKEND_URL = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ?? "http://localhost:9000";

beforeAll(async () => {
  try {
    const response = await fetch(`${BACKEND_URL}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) {
      throw new Error(`responded with status ${response.status}`);
    }
  } catch (error) {
    throw new Error(
      `auth-server.test.ts needs the local Medusa backend running at ${BACKEND_URL} (start it with ` +
        `\`pnpm --filter backend dev\`) — ${error instanceof Error ? error.message : String(error)}`
    );
  }
}, 10000);

function freshEmail(label: string): string {
  return `auth-server-test-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
}

// Reproduces the exact dangling state from the round-1 finding: an auth
// identity that exists (register succeeded) but has no customer record
// attached (the store.customers step never ran) — e.g. because a real
// signup's create-customer call failed partway through. Calling the real
// /auth/customer/emailpass/register route directly (bypassing
// signupCustomer entirely) is the only way to get into this state on
// purpose.
async function registerOnly(email: string, password: string): Promise<void> {
  await medusa.client.fetch("/auth/customer/emailpass/register", {
    method: "POST",
    body: { email, password },
  });
}

describe("signupCustomer", () => {
  test("a fresh signup resolves to a customer-bound token", async () => {
    const email = freshEmail("fresh-signup");
    const result = await signupCustomer(email, "supersecret1");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const customer = await fetchSessionCustomer(result.token);
    expect(customer?.email).toBe(email);
  });

  test("signing up the same email twice reports the duplicate-email error", async () => {
    const email = freshEmail("duplicate-signup");
    const first = await signupCustomer(email, "supersecret1");
    expect(first.ok).toBe(true);

    const second = await signupCustomer(email, "supersecret1");
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.status).toBe(401);
    expect(second.message).toMatch(/already exists/i);
  });
});

describe("loginCustomer — dangling identity recovery (round-1 finding)", () => {
  test("logging in with a registered-but-customerless identity completes the customer instead of returning a false session", async () => {
    const email = freshEmail("dangling-login");
    const password = "supersecret1";

    // Put the account into exactly the broken state the finding describes:
    // an auth identity exists, no customer record does.
    await registerOnly(email, password);

    const result = await loginCustomer(email, password);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // The bug this guards against: the old code returned { ok: true } for
    // *any* 200 from /auth/customer/emailpass, including one whose JWT had
    // no bound customer — which GET /store/customers/me then 401s on
    // forever. Asserting the returned token actually resolves to the right
    // customer is the whole point of this test.
    const customer = await fetchSessionCustomer(result.token);
    expect(customer?.email).toBe(email);
  });

  test("logging in again afterwards (identity now fully set up) still succeeds directly", async () => {
    const email = freshEmail("dangling-login-repeat");
    const password = "supersecret1";

    await registerOnly(email, password);
    const repaired = await loginCustomer(email, password);
    expect(repaired.ok).toBe(true);

    const second = await loginCustomer(email, password);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    const customer = await fetchSessionCustomer(second.token);
    expect(customer?.email).toBe(email);
  });

  test("a wrong password still reports an error, not a false recovery", async () => {
    const email = freshEmail("wrong-password");
    await signupCustomer(email, "supersecret1");

    const result = await loginCustomer(email, "not-the-right-password");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(401);
  });
});
