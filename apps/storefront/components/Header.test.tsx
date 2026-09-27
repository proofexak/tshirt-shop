import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { Header } from "./Header";

describe("Header", () => {
  test("renders a Home link and the default right slot", () => {
    render(<Header />);
    expect(screen.getByRole("link", { name: "Home" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Sign up" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Login" })).toBeVisible();
  });
});
