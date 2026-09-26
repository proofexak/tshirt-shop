"use client";

import { useState } from "react";

export interface Variant {
  id: string;
  title: string;
  inventory_quantity?: number | null;
}

// Fixed size set per the storefront spec ("sizes S-XL"). Buttons are always
// rendered for all four sizes regardless of what `variants` contains — a
// missing or out-of-stock variant renders its button disabled rather than
// omitting it, so the UI never derives its button set from `variants` alone.
const SIZES = ["S", "M", "L", "XL"] as const;

export function VariantPicker({
  variants,
  onSelect,
}: {
  variants: Variant[];
  onSelect: (variantId: string) => void;
}) {
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);

  return (
    <div className="flex gap-2">
      {SIZES.map((size) => {
        const variant = variants.find((v) => v.title === size);
        const inStock = Boolean(variant) && (variant!.inventory_quantity ?? 0) > 0;

        const handleClick = () => {
          if (!variant || !inStock) return;
          setSelectedVariantId(variant.id);
          onSelect(variant.id);
        };

        return (
          <button
            key={size}
            type="button"
            disabled={!inStock}
            aria-pressed={variant?.id === selectedVariantId}
            onClick={handleClick}
            className={
              variant?.id === selectedVariantId
                ? "rounded border-2 border-black px-3 py-1 text-sm font-medium"
                : "rounded border border-gray-300 px-3 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-40"
            }
          >
            {size}
          </button>
        );
      })}
    </div>
  );
}
