import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  SESSION_COOKIE_MAX_AGE,
  SESSION_COOKIE_NAME,
  loginCustomer,
  parseCredentials,
} from "@/lib/auth-server";

export async function POST(request: Request) {
  const parsed = await parseCredentials(request);
  if (!parsed.ok) {
    return NextResponse.json({ message: parsed.message }, { status: 400 });
  }

  const result = await loginCustomer(parsed.email, parsed.password);
  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: result.status });
  }

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, result.token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_COOKIE_MAX_AGE,
  });

  return NextResponse.json({ ok: true });
}
