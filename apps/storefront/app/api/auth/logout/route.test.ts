import { beforeEach, describe, expect, test, vi } from "vitest";
import { POST } from "./route";

const { cookieJar } = vi.hoisted(() => {
  const store = new Map<string, string>();
  return {
    cookieJar: {
      get(name: string) {
        return store.has(name) ? { name, value: store.get(name)! } : undefined;
      },
      set: vi.fn((name: string, value: string) => {
        store.set(name, value);
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

describe("POST /api/auth/logout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookieJar.clearAll();
  });

  test("clears the session cookie and returns ok", async () => {
    cookieJar.set("session_token", "tok_whatever");

    const response = await POST();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(cookieJar.delete).toHaveBeenCalledWith("session_token");
  });
});
