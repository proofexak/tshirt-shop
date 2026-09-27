import { FetchError } from "@medusajs/js-sdk";
import { medusa } from "./medusa-client";

// The httpOnly cookie that holds the customer-bound Medusa session token.
// Never read by browser JS — only route handlers (this module's callers)
// and Server Components read it via next/headers' cookies().
export const SESSION_COOKIE_NAME = "session_token";
// 7 days — a reasonable "stay logged in" window for a storefront; Medusa's
// own JWT has a shorter internal expiry, so a stale-but-still-cookied token
// just fails GET /store/customers/me and useSession() reports "no session"
// (see fetchSessionCustomer below), it doesn't crash anything.
export const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

export type AuthActionResult = { ok: true; token: string } | { ok: false; status: number; message: string };

export type ParsedCredentials = { ok: true; email: string; password: string } | { ok: false; message: string };

// Shared by the signup and login route handlers — both accept the same
// { email, password } JSON body and need the same "is this actually a
// non-empty string pair" guard before ever calling out to Medusa.
export async function parseCredentials(request: Request): Promise<ParsedCredentials> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { ok: false, message: "Invalid request." };
  }

  const email = body && typeof body === "object" && "email" in body ? body.email : undefined;
  const password = body && typeof body === "object" && "password" in body ? body.password : undefined;

  if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
    return { ok: false, message: "Email and password are required." };
  }

  return { ok: true, email, password };
}

// Deliberately does NOT use sdk.auth.register()/sdk.auth.login(): both call
// this.client.setToken() internally, which mutates the *shared* `medusa`
// client instance's own token storage. That instance is a module-level
// singleton reused by every concurrent request this Node process serves, so
// letting one shopper's login token get written into shared client state
// would leak across shoppers on a multi-user server. medusa.client.fetch()
// runs the exact same HTTP calls but lets us thread each token through
// per-call `Authorization` headers instead, so no shared state is ever
// touched — see lib/medusa-client.ts and this task's brief for why this
// matters.
async function authFetch<T>(path: string, body: Record<string, unknown>): Promise<T> {
  return medusa.client.fetch<T>(path, { method: "POST", body });
}

// Medusa's real 4xx (e.g. 401 "Identity with email already exists" for a
// duplicate signup, or a wrong-password login) is safe to relay verbatim —
// it's meant to be shown to the shopper. Anything else (5xx, or a network
// failure that never reached Medusa at all, which surfaces as a plain
// non-FetchError exception rather than one carrying a 5xx status) must not
// leak internal detail, so it's replaced with a generic message.
function toResult(error: unknown): { ok: false; status: number; message: string } {
  if (error instanceof FetchError && error.status !== undefined && error.status >= 400 && error.status < 500) {
    return { ok: false, status: error.status, message: error.message };
  }
  const status = error instanceof FetchError ? (error.status ?? 500) : 500;
  return { ok: false, status, message: "Something went wrong. Please try again." };
}

// The three-round-trip sequence observed in Task 4: register (actorless
// token) -> create the customer record with that token -> log in (customer-
// bound token, the one worth persisting as a session). Only the final
// login's token is ever returned — the actorless registration token is
// one-shot and not useful for anything after step 2.
export async function signupCustomer(email: string, password: string): Promise<AuthActionResult> {
  try {
    const { token: registrationToken } = await authFetch<{ token: string }>(
      "/auth/customer/emailpass/register",
      { email, password }
    );

    await medusa.store.customer.create({ email }, undefined, {
      Authorization: `Bearer ${registrationToken}`,
    });

    const { token } = await authFetch<{ token: string }>("/auth/customer/emailpass", {
      email,
      password,
    });

    return { ok: true, token };
  } catch (error) {
    return toResult(error);
  }
}

export async function loginCustomer(email: string, password: string): Promise<AuthActionResult> {
  try {
    const { token } = await authFetch<{ token: string }>("/auth/customer/emailpass", {
      email,
      password,
    });
    return { ok: true, token };
  } catch (error) {
    return toResult(error);
  }
}

// A missing/expired/invalid token means "no session", not a crash — the
// caller (the /api/auth/session route handler) always gets back either a
// customer or null, never a thrown error.
export async function fetchSessionCustomer(token: string) {
  try {
    const { customer } = await medusa.store.customer.retrieve(undefined, {
      Authorization: `Bearer ${token}`,
    });
    return customer;
  } catch {
    return null;
  }
}
