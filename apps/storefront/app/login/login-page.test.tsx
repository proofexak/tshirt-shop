import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import LoginPage from "./page";

const { mockLogin, mockPush, mockSearchParams } = vi.hoisted(() => ({
  mockLogin: vi.fn(),
  mockPush: vi.fn(),
  mockSearchParams: { get: vi.fn((): string | null => null) },
}));

vi.mock("@/lib/auth", () => ({
  login: (...args: unknown[]) => mockLogin(...args),
  sessionQueryKey: ["session"],
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => mockSearchParams,
}));

function renderLoginPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <LoginPage />
    </QueryClientProvider>
  );
}

describe("LoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams.get.mockReturnValue(null);
  });

  // Controller ruling 3: login failures (wrong password, unknown email —
  // both surface from Medusa as a plain 401) must also show inline, not
  // just signup's duplicate-email case.
  test("a failed login shows an inline error", async () => {
    mockLogin.mockResolvedValueOnce({ ok: false, error: "Invalid email or password" });
    renderLoginPage();

    await userEvent.type(screen.getByLabelText("Email"), "someone@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "wrong-password");
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/invalid email or password/i);
    expect(mockPush).not.toHaveBeenCalled();
  });

  test("password field is masked", () => {
    renderLoginPage();
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
  });

  test("a successful login calls login() and navigates to / by default", async () => {
    mockLogin.mockResolvedValueOnce({ ok: true });
    renderLoginPage();

    await userEvent.type(screen.getByLabelText("Email"), "someone@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "correct-password");
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));

    await waitFor(() =>
      expect(mockLogin).toHaveBeenCalledWith("someone@example.com", "correct-password")
    );
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/"));
  });

  test("navigates to a safe `next` path after login", async () => {
    mockSearchParams.get.mockReturnValue("/account");
    mockLogin.mockResolvedValueOnce({ ok: true });
    renderLoginPage();

    await userEvent.type(screen.getByLabelText("Email"), "someone@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "correct-password");
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/account"));
  });

  test("ignores an unsafe protocol-relative `next` URL and falls back to /", async () => {
    mockSearchParams.get.mockReturnValue("//evil.com");
    mockLogin.mockResolvedValueOnce({ ok: true });
    renderLoginPage();

    await userEvent.type(screen.getByLabelText("Email"), "someone@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "correct-password");
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/"));
  });
});
