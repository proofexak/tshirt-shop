// Round-1 review finding 3: signup-page.test.tsx mocks all of @/lib/auth,
// so mockRegisterConflict() there returns an already-mapped
// { ok: false, error } — no real 401 body ever exists in that file. This
// file renders the REAL page with the REAL lib/auth.ts (not mocked),
// stubbing only global fetch (the actual network boundary), so the whole
// chain — SignupPage's error state, lib/auth.ts's signup()/postAuth() — runs
// for real against a real 401 response body, and a real 5xx one.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import SignupPage from "./page";

const { mockPush } = vi.hoisted(() => ({ mockPush: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => ({ get: () => null }),
}));

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function renderSignupPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <SignupPage />
    </QueryClientProvider>
  );
}

describe("SignupPage — real lib/auth.ts against a stubbed network boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("a real 401 duplicate-email response renders inline, near the Email field", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(jsonResponse(401, { message: "Identity with email already exists" }))
    );
    renderSignupPage();

    await userEvent.type(screen.getByLabelText("Email"), "dup@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "hunter2");
    await userEvent.click(screen.getByRole("button", { name: "Sign up" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/identity with email already exists/i);
    expect(mockPush).not.toHaveBeenCalled();
  });

  test("a real 5xx response renders the generic message, never the raw body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(500, { message: "some internal stack trace detail" }))
    );
    renderSignupPage();

    await userEvent.type(screen.getByLabelText("Email"), "new@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "hunter2");
    await userEvent.click(screen.getByRole("button", { name: "Sign up" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/something went wrong/i);
    expect(alert).not.toHaveTextContent(/stack trace/i);
  });

  test("a network failure (fetch rejects) renders the generic message, not a crash", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    renderSignupPage();

    await userEvent.type(screen.getByLabelText("Email"), "new@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "hunter2");
    await userEvent.click(screen.getByRole("button", { name: "Sign up" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/something went wrong/i);
  });
});
