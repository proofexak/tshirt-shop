// Round-1 review finding 3: postAuth's 4xx/5xx/network-failure handling had
// no test at all — every existing test mocked @/lib/auth itself, so an
// already-mapped { ok: false, error } was all that was ever exercised, and
// no real 401 body existed anywhere in the suite. This mocks global fetch
// (the actual network boundary lib/auth.ts crosses) instead, so postAuth's
// own status-based branching runs for real.
import { afterEach, describe, expect, test, vi } from "vitest";
import { login, signup } from "./auth";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("signup/login — postAuth's network-boundary handling", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("a real 401 duplicate-email body is surfaced verbatim", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(401, { message: "Identity with email already exists" }))
    );

    const result = await signup("dup@example.com", "hunter2");

    expect(result).toEqual({ ok: false, error: "Identity with email already exists" });
  });

  test("a wrong-password 401 is surfaced verbatim for login", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(401, { message: "Invalid email or password" }))
    );

    const result = await login("shopper@example.com", "wrong");

    expect(result).toEqual({ ok: false, error: "Invalid email or password" });
  });

  test("a 5xx never surfaces its body's message, even if the body has one", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(jsonResponse(500, { message: "some internal stack trace detail" }))
    );

    const result = await signup("new@example.com", "hunter2");

    expect(result).toEqual({ ok: false, error: "Something went wrong. Please try again." });
  });

  test("a 5xx with an unparseable (non-JSON) body still falls back to the generic message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("<html>Internal Server Error</html>", {
          status: 500,
          headers: { "content-type": "text/html" },
        })
      )
    );

    const result = await signup("new@example.com", "hunter2");

    expect(result).toEqual({ ok: false, error: "Something went wrong. Please try again." });
  });

  test("a network failure (fetch rejects) resolves the generic message, not a throw", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    const result = await signup("new@example.com", "hunter2");

    expect(result).toEqual({ ok: false, error: "Something went wrong. Please try again." });
  });

  test("a successful response resolves { ok: true } regardless of body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { ok: true })));

    const result = await login("shopper@example.com", "correct-password");

    expect(result).toEqual({ ok: true });
  });
});
