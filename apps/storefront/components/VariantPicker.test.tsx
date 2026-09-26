import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { VariantPicker, type Variant } from "./VariantPicker";

// Basic Hoodie: S is seeded out of stock (quantity 0), the rest have 10
// (see apps/backend/src/scripts/seed-premade-products.ts).
const basicHoodieVariants: Variant[] = [
  { id: "variant_s", title: "S", inventory_quantity: 0 },
  { id: "variant_m", title: "M", inventory_quantity: 10 },
  { id: "variant_l", title: "L", inventory_quantity: 10 },
  { id: "variant_xl", title: "XL", inventory_quantity: 10 },
];

// A product with no XL variant at all — the fixed S/M/L/XL button set must
// still render an XL button, just disabled, rather than deriving buttons
// from `variants` (which would omit it and could crash on the lookup).
const partialVariantSet: Variant[] = [
  { id: "variant_s", title: "S", inventory_quantity: 10 },
  { id: "variant_m", title: "M", inventory_quantity: 10 },
  { id: "variant_l", title: "L", inventory_quantity: 10 },
];

describe("VariantPicker", () => {
  test("out-of-stock variant is rendered disabled", () => {
    render(<VariantPicker variants={basicHoodieVariants} onSelect={vi.fn()} />);
    expect(screen.getByRole("button", { name: "S" })).toBeDisabled();
  });

  test("a size with no matching variant renders without crashing and is not selectable", () => {
    render(<VariantPicker variants={partialVariantSet} onSelect={vi.fn()} />);
    expect(screen.getByRole("button", { name: "XL" })).toBeDisabled();
  });

  test("an in-stock variant is rendered enabled", () => {
    render(<VariantPicker variants={basicHoodieVariants} onSelect={vi.fn()} />);
    expect(screen.getByRole("button", { name: "M" })).toBeEnabled();
  });

  test("clicking an enabled size calls onSelect with that variant's id", () => {
    const onSelect = vi.fn();
    render(<VariantPicker variants={basicHoodieVariants} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: "M" }));
    expect(onSelect).toHaveBeenCalledWith("variant_m");
  });

  test("clicking a disabled size does not call onSelect", () => {
    const onSelect = vi.fn();
    render(<VariantPicker variants={basicHoodieVariants} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: "S" }));
    expect(onSelect).not.toHaveBeenCalled();
  });
});
