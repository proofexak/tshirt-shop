import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import SignupPage from "./page";

// vi.mock factories are hoisted above this file's own top-level code —
// anything they close over has to come from vi.hoisted() (see
// product-page-cart.test.tsx for the same pattern).
const { mockSignup, mockPush, mockSearchParams } = vi.hoisted(() => ({
  mockSignup: vi.fn(),
  mockPush: vi.fn(),
  mockSearchParams: { get: vi.fn((): string | null => null) },
}));

// This is a UI test: it only needs to prove the page renders the labelled
// fields, calls signup() with the entered values, and maps its result onto
// the page (inline error, or navigate-on-success). The real Medusa-backed
// register -> create customer -> login sequence lives in lib/auth-server.ts
// and is exercised by live verification instead (see the task report) —
// same division of responsibility as lib/cart.ts vs. the product page test.
vi.mock("@/lib/auth", () => ({
  signup: (...args: unknown[]) => mockSignup(...args),
  sessionQueryKey: ["session"],
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => mockSearchParams,
}));

function renderSignupPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <SignupPage />
    </QueryClientProvider>
  );
}

// Per this task's controller ruling 3 (and the Task 4 report it cites):
// Medusa's real duplicate-email response is a 401 with message "Identity
// with email already exists" — not the 409 the brief's literal test
// snippet describes. This mocks the real shape rather than the plan's
// placeholder one.
function mockRegisterConflict() {
  mockSignup.mockResolvedValueOnce({
    ok: false,
    error: "Identity with email already exists",
  });
}

describe("SignupPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams.get.mockReturnValue(null);
  });

  test("signing up with an existing email shows an inline error", async () => {
    mockRegisterConflict();
    renderSignupPage();

    await userEvent.type(screen.getByLabelText("Email"), "dup@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Sign up" }));

    expect(await screen.findByText(/already exists/i)).toBeVisible();
    expect(mockPush).not.toHaveBeenCalled();
  });

  test("the inline error has an accessible alert role", async () => {
    mockRegisterConflict();
    renderSignupPage();

    await userEvent.type(screen.getByLabelText("Email"), "dup@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Sign up" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/already exists/i);
  });

  test("password field is masked", () => {
    renderSignupPage();
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
  });

  test("a successful signup calls signup() and navigates to / when there is no next param", async () => {
    mockSignup.mockResolvedValueOnce({ ok: true });
    renderSignupPage();

    await userEvent.type(screen.getByLabelText("Email"), "new@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "supersecret1");
    await userEvent.click(screen.getByRole("button", { name: "Sign up" }));

    await waitFor(() => expect(mockSignup).toHaveBeenCalledWith("new@example.com", "supersecret1"));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/"));
  });

  test("navigates to a safe `next` path after signup", async () => {
    mockSearchParams.get.mockReturnValue("/checkout");
    mockSignup.mockResolvedValueOnce({ ok: true });
    renderSignupPage();

    await userEvent.type(screen.getByLabelText("Email"), "new@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "supersecret1");
    await userEvent.click(screen.getByRole("button", { name: "Sign up" }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/checkout"));
  });

  test("ignores an unsafe absolute `next` URL and falls back to /", async () => {
    mockSearchParams.get.mockReturnValue("https://evil.com");
    mockSignup.mockResolvedValueOnce({ ok: true });
    renderSignupPage();

    await userEvent.type(screen.getByLabelText("Email"), "new@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "supersecret1");
    await userEvent.click(screen.getByRole("button", { name: "Sign up" }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/"));
  });
});
