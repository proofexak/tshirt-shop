import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth-server";
import { listCustomerOrders } from "@/lib/orders";

// useOrders()'s server boundary (mirrors app/api/auth/session/route.ts and
// app/api/orders/[id]/route.ts): reads the httpOnly session cookie and
// lists the logged-in customer's own past orders, newest first. No
// session -> `{ orders: [] }`, never a thrown error.
export async function GET() {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return NextResponse.json({ orders: [] });
  }

  const orders = await listCustomerOrders(token);
  return NextResponse.json({ orders });
}
