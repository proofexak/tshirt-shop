"use client";

// The client-side boundary for customer auth. Browser JS never holds a
// Medusa token — signup/login/logout all go through Next.js Route Handlers
// (app/api/auth/*) that do the actual work server-side and manage the
// httpOnly session cookie; this module only ever talks to those handlers
// over same-origin fetch. See lib/auth-server.ts for the server-side logic.
import { useQuery } from "@tanstack/react-query";

// Shared by useSession() and invalidated by signup/login/logout so the
// header (and anything else reading session state) stays in sync —
// mirrors hooks/useCart.ts's cartQueryKey pattern.
export const sessionQueryKey = ["session"] as const;

export type AuthResult = { ok: true } | { ok: false; error: string };

const GENERIC_ERROR = "Something went wrong. Please try again.";

async function postAuth(path: string, email: string, password: string): Promise<AuthResult> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    // Network failure — the request never reached our own server.
    return { ok: false, error: GENERIC_ERROR };
  }

  if (response.ok) {
    return { ok: true };
  }

  // Defense in depth (round-1 review finding 3): only ever surface a 4xx's
  // body message. Our own route handlers already guarantee a 5xx body
  // never carries real error detail (lib/auth-server.ts's toResult maps
  // any non-4xx failure to this same generic string before it's ever sent),
  // but this doesn't rely on that holding forever — a 5xx here always
  // renders the generic message regardless of what its body contains.
  if (response.status < 400 || response.status >= 500) {
    return { ok: false, error: GENERIC_ERROR };
  }

  const data: unknown = await response.json().catch(() => null);
  const message =
    data && typeof data === "object" && "message" in data && typeof data.message === "string"
      ? data.message
      : GENERIC_ERROR;
  return { ok: false, error: message };
}

// Runs the full register -> create customer -> login sequence server-side
// (via app/api/auth/signup/route.ts) and, on success, sets the httpOnly
// session cookie. Resolves { ok: false, error } (Medusa's own 4xx message,
// e.g. "Identity with email already exists") instead of throwing, so the
// signup page can render it inline without a try/catch.
export function signup(email: string, password: string): Promise<AuthResult> {
  return postAuth("/api/auth/signup", email, password);
}

export function login(email: string, password: string): Promise<AuthResult> {
  return postAuth("/api/auth/login", email, password);
}

export async function logout(): Promise<void> {
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } catch {
    // Best-effort — if this fails the cookie may still be present, but
    // there's nothing actionable to show the shopper for a logout call.
  }
}

export type SessionCustomer = {
  id: string;
  email: string;
} & Record<string, unknown>;

// Reads the session through the server boundary (app/api/auth/session/
// route.ts), which reads the httpOnly cookie and calls
// GET /store/customers/me server-side. A missing/expired/invalid token
// resolves `customer: null` from that route, never a thrown error, so this
// always settles to a customer or null — never a crash.
export function useSession() {
  return useQuery({
    queryKey: sessionQueryKey,
    queryFn: async (): Promise<SessionCustomer | null> => {
      const response = await fetch("/api/auth/session");
      if (!response.ok) {
        return null;
      }
      const data = (await response.json()) as { customer: SessionCustomer | null };
      return data.customer ?? null;
    },
  });
}
