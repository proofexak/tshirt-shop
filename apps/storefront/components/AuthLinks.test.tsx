import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthLinks } from "./AuthLinks";

const { mockUseSession, mockLogout } = vi.hoisted(() => ({
  mockUseSession: vi.fn(),
  mockLogout: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  useSession: () => mockUseSession(),
  logout: (...args: unknown[]) => mockLogout(...args),
  sessionQueryKey: ["session"],
}));

function renderAuthLinks() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthLinks />
    </QueryClientProvider>
  );
}

describe("AuthLinks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLogout.mockResolvedValue(undefined);
  });

  test("shows Sign up and Login links when logged out", () => {
    mockUseSession.mockReturnValue({ data: null, isLoading: false });
    renderAuthLinks();

    expect(screen.getByRole("link", { name: "Sign up" })).toHaveAttribute("href", "/signup");
    expect(screen.getByRole("link", { name: "Login" })).toHaveAttribute("href", "/login");
    expect(screen.queryByRole("link", { name: "Account" })).not.toBeInTheDocument();
  });

  test("shows Account and Log out when logged in", async () => {
    mockUseSession.mockReturnValue({
      data: { id: "cus_123", email: "shopper@example.com" },
      isLoading: false,
    });
    renderAuthLinks();

    expect(screen.getByRole("link", { name: "Account" })).toHaveAttribute("href", "/account");
    expect(screen.queryByRole("link", { name: "Sign up" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Log out" }));

    await waitFor(() => expect(mockLogout).toHaveBeenCalled());
  });

  test("renders nothing while the session is loading", () => {
    mockUseSession.mockReturnValue({ data: undefined, isLoading: true });
    const { container } = renderAuthLinks();

    expect(container).toBeEmptyDOMElement();
  });
});
