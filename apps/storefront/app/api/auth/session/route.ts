import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, fetchSessionCustomer } from "@/lib/auth-server";

// useSession()'s server boundary: reads the httpOnly cookie (never exposed
// to browser JS) and, if present, resolves it against Medusa. A missing,
// expired, or otherwise invalid token comes back as { customer: null } —
// never a thrown error — matching controller ruling 2.
export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return NextResponse.json({ customer: null });
  }

  const customer = await fetchSessionCustomer(token);
  return NextResponse.json({ customer });
}
