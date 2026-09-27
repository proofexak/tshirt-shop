import type { Variant } from "@/components/VariantPicker";

export interface ProductForImage {
  thumbnail?: string | null;
  images?: { url: string }[] | null;
  variants?: Variant[] | null;
}

// Finds the variant matching every option value already chosen. An empty
// selection never "matches" anything here — before any option is picked
// (or on a product whose options don't resolve to any single variant),
// this falls straight through to the thumbnail/first-image fallbacks below
// rather than grabbing an arbitrary first variant.
function findMatchingVariant(
  variants: Variant[],
  selection: Record<string, string>
): Variant | undefined {
  const entries = Object.entries(selection);
  if (entries.length === 0) {
    return undefined;
  }
  return variants.find((variant) =>
    entries.every(([optionId, value]) =>
      (variant.options ?? []).some((o) => o.option_id === optionId && o.value === value)
    )
  );
}

// The photo to show for the current selection: the matching variant's own
// image, else the product thumbnail, else the product's first image, else
// null (the caller — ProductImage — renders a placeholder for null).
export function pickProductImage(
  product: ProductForImage,
  selection: Record<string, string>
): string | null {
  const matchingVariant = findMatchingVariant(product.variants ?? [], selection);
  const variantImageUrl = matchingVariant?.images?.[0]?.url;
  if (variantImageUrl) {
    return variantImageUrl;
  }
  if (product.thumbnail) {
    return product.thumbnail;
  }
  const firstImageUrl = product.images?.[0]?.url;
  if (firstImageUrl) {
    return firstImageUrl;
  }
  return null;
}
