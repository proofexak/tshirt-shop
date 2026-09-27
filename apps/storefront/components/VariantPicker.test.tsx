import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { VariantPicker, type ProductOption, type Variant } from "./VariantPicker";

// Fixtures mirror Task 14's seeded catalog: options in Medusa's real order
// (Colour, then Size — confirmed against the live dev DB), variant titles
// "<Colour> / <Size>".
const COLOUR_ID = "opt_colour";
const SIZE_ID = "opt_size";

function option(id: string, title: string, values: string[]): ProductOption {
  return { id, title, values: values.map((value) => ({ value })) };
}

function variant(
  id: string,
  colour: string,
  size: string,
  inventory_quantity: number,
  images?: { url: string }[]
): Variant {
  return {
    id,
    title: `${colour} / ${size}`,
    inventory_quantity,
    options: [
      { option_id: COLOUR_ID, value: colour },
      { option_id: SIZE_ID, value: size },
    ],
    images: images ?? null,
  };
}

// v-neck-tee: no White / XL (7 variants, all in stock).
const vneckOptions: ProductOption[] = [
  option(COLOUR_ID, "Colour", ["Black", "White"]),
  option(SIZE_ID, "Size", ["S", "M", "L", "XL"]),
];

const blackMId = "variant_black_m";

const vneckVariants: Variant[] = [
  variant("variant_black_s", "Black", "S", 10),
  variant(blackMId, "Black", "M", 10),
  variant("variant_black_l", "Black", "L", 10),
  variant("variant_black_xl", "Black", "XL", 10),
  variant("variant_white_s", "White", "S", 10),
  variant("variant_white_m", "White", "M", 10),
  variant("variant_white_l", "White", "L", 10),
];

// basic-hoodie: full Size x Colour grid, Black / S seeded out of stock.
const hoodieOptions: ProductOption[] = [
  option(COLOUR_ID, "Colour", ["Black", "White"]),
  option(SIZE_ID, "Size", ["S", "M", "L", "XL"]),
];

const hoodieVariants: Variant[] = [
  variant("variant_hoodie_black_s", "Black", "S", 0),
  variant("variant_hoodie_black_m", "Black", "M", 10),
  variant("variant_hoodie_black_l", "Black", "L", 10),
  variant("variant_hoodie_black_xl", "Black", "XL", 10),
  variant("variant_hoodie_white_s", "White", "S", 10),
  variant("variant_hoodie_white_m", "White", "M", 10),
  variant("variant_hoodie_white_l", "White", "L", 10),
  variant("variant_hoodie_white_xl", "White", "XL", 10),
];

describe("VariantPicker", () => {
  test("renders one labelled group per option", () => {
    render(<VariantPicker options={vneckOptions} variants={vneckVariants} onSelect={vi.fn()} />);

    expect(screen.getByRole("group", { name: "Size" })).toBeVisible();
    expect(screen.getByRole("group", { name: "Colour" })).toBeVisible();
  });

  test("a combination with no matching variant is disabled", () => {
    render(<VariantPicker options={vneckOptions} variants={vneckVariants} onSelect={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "White" }));

    const sizeGroup = screen.getByRole("group", { name: "Size" });
    expect(within(sizeGroup).getByRole("button", { name: "XL" })).toBeDisabled();
    expect(within(sizeGroup).getByRole("button", { name: "M" })).toBeEnabled();
  });

  test("an out-of-stock combination is disabled", () => {
    render(<VariantPicker options={hoodieOptions} variants={hoodieVariants} onSelect={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Black" }));

    const sizeGroup = screen.getByRole("group", { name: "Size" });
    expect(within(sizeGroup).getByRole("button", { name: "S" })).toBeDisabled();
  });

  test("onSelect gets null until every option is chosen, then the variant id", () => {
    const onSelect = vi.fn();
    render(<VariantPicker options={vneckOptions} variants={vneckVariants} onSelect={onSelect} />);

    fireEvent.click(screen.getByRole("button", { name: "Black" }));
    expect(onSelect).toHaveBeenLastCalledWith(null);

    fireEvent.click(screen.getByRole("button", { name: "M" }));
    expect(onSelect).toHaveBeenLastCalledWith(blackMId);
  });

  test("a choice made impossible by a new choice is cleared", () => {
    const onSelect = vi.fn();
    const onSelectionChange = vi.fn();
    render(
      <VariantPicker
        options={vneckOptions}
        variants={vneckVariants}
        onSelect={onSelect}
        onSelectionChange={onSelectionChange}
      />
    );

    // Size is picked before Colour — out of the "natural" order.
    fireEvent.click(screen.getByRole("button", { name: "XL" }));
    fireEvent.click(screen.getByRole("button", { name: "White" }));

    // v-neck has no White / XL, so the earlier XL pick must be cleared
    // rather than the White click being blocked.
    expect(onSelectionChange).toHaveBeenLastCalledWith({ [COLOUR_ID]: "White" });
    expect(onSelect).toHaveBeenLastCalledWith(null);
    expect(screen.getByRole("button", { name: "XL" })).not.toHaveAttribute("aria-pressed", "true");
  });

  test("a single-value option is preselected", () => {
    const onSelect = vi.fn();
    const singleOption: ProductOption[] = [option("opt_color", "Color", ["Red"])];
    const singleVariant: Variant[] = [
      { id: "variant_red", title: "Red", inventory_quantity: 10, options: [{ option_id: "opt_color", value: "Red" }] },
    ];

    render(<VariantPicker options={singleOption} variants={singleVariant} onSelect={onSelect} />);

    expect(onSelect).toHaveBeenCalledWith("variant_red");
  });

  test("sizes are ordered S, M, L, XL regardless of API order", () => {
    const scrambledOptions: ProductOption[] = [
      option(COLOUR_ID, "Colour", ["Black", "White"]),
      option(SIZE_ID, "Size", ["XL", "S", "L", "M"]),
    ];

    render(<VariantPicker options={scrambledOptions} variants={vneckVariants} onSelect={vi.fn()} />);

    const sizeGroup = screen.getByRole("group", { name: "Size" });
    const labels = within(sizeGroup)
      .getAllByRole("button")
      .map((button) => button.textContent);
    expect(labels).toEqual(["S", "M", "L", "XL"]);
  });

  test("a product with no in-stock variant renders every choice disabled", () => {
    const outOfStockVariants = hoodieVariants.map((v) => ({ ...v, inventory_quantity: 0 }));

    render(
      <VariantPicker options={hoodieOptions} variants={outOfStockVariants} onSelect={vi.fn()} />
    );

    for (const button of screen.getAllByRole("button")) {
      expect(button).toBeDisabled();
    }
  });
});
