import { beforeEach, describe, expect, test, vi } from "vitest";
import { POST } from "./route";

const { mockLoginCustomer, cookieJar } = vi.hoisted(() => {
  const store = new Map<string, { value: string; options?: Record<string, unknown> }>();
  return {
    mockLoginCustomer: vi.fn(),
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
    loginCustomer: (...args: [string, string]) => mockLoginCustomer(...args),
  };
});

function postJson(body: unknown) {
  return new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookieJar.clearAll();
  });

  test("on success: 200, body has no token, cookie set httpOnly with the real token", async () => {
    mockLoginCustomer.mockResolvedValueOnce({ ok: true, token: "tok_login_secret" });

    const response = await POST(postJson({ email: "shopper@example.com", password: "hunter2" }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ ok: true });
    expect(JSON.stringify(body)).not.toContain("tok_login_secret");

    expect(cookieJar.set).toHaveBeenCalledTimes(1);
    const [name, value, options] = cookieJar.set.mock.calls[0];
    expect(name).toBe("session_token");
    expect(value).toBe("tok_login_secret");
    expect(options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
  });

  // A wrong password and an unknown email both surface from Medusa as a
  // plain 401 (Task 4) — ruling 3 requires this shown inline too.
  test("on a wrong-password 401: relays status and message, sets no cookie", async () => {
    mockLoginCustomer.mockResolvedValueOnce({
      ok: false,
      status: 401,
      message: "Invalid email or password",
    });

    const response = await POST(postJson({ email: "shopper@example.com", password: "wrong" }));

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toEqual({ message: "Invalid email or password" });
    expect(cookieJar.set).not.toHaveBeenCalled();
  });

  test("rejects a request with an empty password with 400 and never calls loginCustomer", async () => {
    const response = await POST(postJson({ email: "shopper@example.com", password: "" }));

    expect(response.status).toBe(400);
    expect(mockLoginCustomer).not.toHaveBeenCalled();
    expect(cookieJar.set).not.toHaveBeenCalled();
  });
});
