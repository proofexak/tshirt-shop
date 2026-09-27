"use client";

import { useEffect, useState } from "react";

export interface ProductOption {
  id: string;
  title: string;
  values: { value: string }[];
}

export interface Variant {
  id: string;
  title: string;
  inventory_quantity?: number | null;
  options?: { option_id: string; value: string }[] | null;
  images?: { url: string }[] | null;
}

type Selection = Record<string, string>;

// Only "Size" gets a fixed sort order — every other option (Colour, or
// whatever an admin names it) keeps Medusa's own value order.
const SIZE_ORDER = ["S", "M", "L", "XL"];

function sortedValues(option: ProductOption): { value: string }[] {
  if (option.title !== "Size") {
    return option.values;
  }
  return [...option.values].sort(
    (a, b) => SIZE_ORDER.indexOf(a.value) - SIZE_ORDER.indexOf(b.value)
  );
}

// Is there an in-stock variant matching `value` for `optionId` together with
// every value in `constraint`? `constraint` should never include `optionId`
// itself — the option being evaluated never constrains its own candidates.
function hasInStockMatch(
  variants: Variant[],
  constraint: Selection,
  optionId: string,
  value: string
): boolean {
  const candidate: Selection = { ...constraint, [optionId]: value };
  return variants.some(
    (variant) =>
      (variant.inventory_quantity ?? 0) > 0 &&
      Object.entries(candidate).every(([optId, val]) =>
        (variant.options ?? []).some((o) => o.option_id === optId && o.value === val)
      )
  );
}

// Only the selections belonging to options that come BEFORE `index` in
// Medusa's option order constrain a given option's choices — e.g. picking a
// Colour narrows down which Sizes are in stock, but picking a Size never
// disables a Colour. This one-directional dependency is what lets a later
// choice (Size) be cleared by an earlier one (Colour) rather than the
// earlier choice simply blocking the later click outright: a disabled
// button never fires a click, so clearing (not blocking) is the only way a
// later, out-of-order pick can still succeed.
function precedingSelection(
  selection: Selection,
  options: ProductOption[],
  index: number
): Selection {
  const precedingIds = new Set(options.slice(0, index).map((o) => o.id));
  const result: Selection = {};
  for (const [optionId, value] of Object.entries(selection)) {
    if (precedingIds.has(optionId)) {
      result[optionId] = value;
    }
  }
  return result;
}

// Options with exactly one value are pre-selected on mount — this also
// covers a product whose only option isn't named "Size"/"Colour" at all.
function initialSelection(options: ProductOption[]): Selection {
  const selection: Selection = {};
  for (const option of options) {
    if (option.values.length === 1) {
      selection[option.id] = option.values[0].value;
    }
  }
  return selection;
}

function findMatchingVariant(
  variants: Variant[],
  options: ProductOption[],
  selection: Selection
): Variant | null {
  if (Object.keys(selection).length !== options.length) {
    return null;
  }
  return (
    variants.find(
      (variant) =>
        (variant.inventory_quantity ?? 0) > 0 &&
        options.every((option) =>
          (variant.options ?? []).some(
            (o) => o.option_id === option.id && o.value === selection[option.id]
          )
        )
    ) ?? null
  );
}

export function VariantPicker({
  options,
  variants,
  onSelect,
  onSelectionChange,
}: {
  options: ProductOption[];
  variants: Variant[];
  onSelect: (variantId: string | null) => void;
  onSelectionChange?: (selection: Record<string, string>) => void;
}) {
  const [selection, setSelection] = useState<Selection>(() => initialSelection(options));

  useEffect(() => {
    onSelectionChange?.(selection);
    const matched = findMatchingVariant(variants, options, selection);
    onSelect(matched?.id ?? null);
    // Only re-run when the selection itself changes — onSelect/onSelectionChange
    // are callbacks from the caller, and including them risks re-firing on
    // every parent render rather than only on an actual selection change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection]);

  function handleClick(optionIndex: number, optionId: string, value: string) {
    const preceding = precedingSelection(selection, options, optionIndex);
    if (!hasInStockMatch(variants, preceding, optionId, value)) {
      return;
    }

    const next: Selection = { ...selection, [optionId]: value };

    // Options before this one are never affected. Walk the options after it
    // in order, dropping any current selection that the new pick (plus
    // everything decided so far) makes impossible.
    for (let j = optionIndex + 1; j < options.length; j++) {
      const laterOption = options[j];
      const currentValue = next[laterOption.id];
      if (currentValue === undefined) continue;
      const precedingForLater = precedingSelection(next, options, j);
      if (!hasInStockMatch(variants, precedingForLater, laterOption.id, currentValue)) {
        delete next[laterOption.id];
      }
    }

    setSelection(next);
  }

  return (
    <div className="flex flex-col gap-4">
      {options.map((option, index) => {
        const labelId = `variant-option-${option.id}`;
        const preceding = precedingSelection(selection, options, index);
        return (
          <div key={option.id}>
            <p id={labelId} className="mb-1 text-sm font-medium">
              {option.title}
            </p>
            <div role="group" aria-labelledby={labelId} className="flex gap-2">
              {sortedValues(option).map(({ value }) => {
                const enabled = hasInStockMatch(variants, preceding, option.id, value);
                const selected = selection[option.id] === value;
                return (
                  <button
                    key={value}
                    type="button"
                    disabled={!enabled}
                    aria-pressed={selected}
                    onClick={() => handleClick(index, option.id, value)}
                    className={
                      selected
                        ? "rounded border-2 border-black px-3 py-1 text-sm font-medium"
                        : "rounded border border-gray-300 px-3 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-40"
                    }
                  >
                    {value}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
