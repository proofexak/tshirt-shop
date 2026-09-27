import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth-server";
import { getOrderForCustomer } from "@/lib/orders";

// useOrder()'s server boundary (mirrors app/api/auth/session/route.ts):
// reads the httpOnly session cookie, never exposed to browser JS, and
// resolves the order through lib/orders.ts's getOrderForCustomer, which
// enforces that the order belongs to the logged-in customer (Medusa's own
// GET /store/orders/:id route does not — see lib/orders.ts for why).
//
// Always responds 200 with `{ order }`, where `order` is null for every
// "can't show this" case (no session, order doesn't exist, malformed id,
// someone else's order) — never a 404/403, so the response itself can't be
// used to probe whether a given order id exists.
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return NextResponse.json({ order: null });
  }

  const order = await getOrderForCustomer(id, token);
  return NextResponse.json({ order });
}
