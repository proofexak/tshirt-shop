import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  SESSION_COOKIE_MAX_AGE,
  SESSION_COOKIE_NAME,
  parseCredentials,
  signupCustomer,
} from "@/lib/auth-server";

// The route handler is the server/client boundary (controller ruling 1):
// it runs the whole register -> create customer -> login sequence and is
// the only place that ever sees the resulting Medusa token — it's set on
// an httpOnly cookie here and never sent back in the JSON body, so browser
// JS (including lib/auth.ts's `signup()`) never holds it.
export async function POST(request: Request) {
  const parsed = await parseCredentials(request);
  if (!parsed.ok) {
    return NextResponse.json({ message: parsed.message }, { status: 400 });
  }

  const result = await signupCustomer(parsed.email, parsed.password);
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
