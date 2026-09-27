// Round-1 review finding 3: the response's status/body/cookie behavior of
// the route handlers themselves had no test — only the already-mapped
// { ok, error } shape from a fully-mocked lib/auth was exercised anywhere.
// This mocks only the Medusa-touching call (signupCustomer) and the cookie
// store (next/headers), keeping parseCredentials/the constants real, so the
// route's own validation, status-code, response-body, and cookie-option
// wiring all run for real.
import { beforeEach, describe, expect, test, vi } from "vitest";
import { POST } from "./route";

const { mockSignupCustomer, cookieJar } = vi.hoisted(() => {
  const store = new Map<string, { value: string; options?: Record<string, unknown> }>();
  return {
    mockSignupCustomer: vi.fn(),
    cookieJar: {
      get(name: string) {
        return store.has(name) ? { name, value: store.get(name)!.value } : undefined;
      },
      set: vi.fn((name: string, value: string, options?: Record<string, unknown>) => {
        store.set(name, { value, options });
      }),
      delete: vi.fn((name: string) => {
        store.delete(name);
      }),
      clearAll() {
        store.clear();
      },
    },
  };
});

vi.mock("next/headers", () => ({
  cookies: async () => cookieJar,
}));

vi.mock("@/lib/auth-server", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth-server")>("@/lib/auth-server");
  return {
    ...actual,
    signupCustomer: (...args: [string, string]) => mockSignupCustomer(...args),
  };
});

function postJson(body: unknown) {
  return new Request("http://localhost/api/auth/signup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/signup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookieJar.clearAll();
  });

  test("rejects a request missing email/password with 400 and sets no cookie", async () => {
    const response = await POST(postJson({ email: "only-email@example.com" }));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toEqual({ message: "Email and password are required." });
    expect(mockSignupCustomer).not.toHaveBeenCalled();
    expect(cookieJar.set).not.toHaveBeenCalled();
  });

  test("on success: 200, body has no token, and the cookie is set httpOnly with the real token", async () => {
    mockSignupCustomer.mockResolvedValueOnce({ ok: true, token: "tok_super_secret_value" });

    const response = await POST(postJson({ email: "new@example.com", password: "hunter2" }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ ok: true });
    expect(JSON.stringify(body)).not.toContain("tok_super_secret_value");

    expect(cookieJar.set).toHaveBeenCalledTimes(1);
    const [name, value, options] = cookieJar.set.mock.calls[0];
    expect(name).toBe("session_token");
    expect(value).toBe("tok_super_secret_value");
    expect(options).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
    expect(typeof options?.maxAge).toBe("number");
    expect(options?.maxAge).toBeGreaterThan(0);
  });

  test("on a real Medusa 401 (e.g. duplicate email): relays status and message, sets no cookie, body has no token", async () => {
    mockSignupCustomer.mockResolvedValueOnce({
      ok: false,
      status: 401,
      message: "Identity with email already exists",
    });

    const response = await POST(postJson({ email: "dup@example.com", password: "hunter2" }));

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toEqual({ message: "Identity with email already exists" });
    expect(cookieJar.set).not.toHaveBeenCalled();
  });

  test("on a 5xx from signupCustomer: relays the (already-generic) status and message, sets no cookie", async () => {
    mockSignupCustomer.mockResolvedValueOnce({
      ok: false,
      status: 500,
      message: "Something went wrong. Please try again.",
    });

    const response = await POST(postJson({ email: "new@example.com", password: "hunter2" }));

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ message: "Something went wrong. Please try again." });
    expect(cookieJar.set).not.toHaveBeenCalled();
  });
});
