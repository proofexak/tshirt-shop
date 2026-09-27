import { describe, expect, test } from "vitest";
import { pickProductImage } from "./product-image";
import type { Variant } from "@/components/VariantPicker";

const colourId = "opt_colour";
const sizeId = "opt_size";

const blackUrl = "http://localhost:9000/static/1-classic-crew-tee-black.png";
const whiteUrl = "http://localhost:9000/static/2-classic-crew-tee-white.png";
const firstImageUrl = "http://localhost:9000/static/3-classic-crew-tee-first.png";

function variant(id: string, colour: string, size: string, images?: { url: string }[]): Variant {
  return {
    id,
    title: `${colour} / ${size}`,
    inventory_quantity: 10,
    options: [
      { option_id: colourId, value: colour },
      { option_id: sizeId, value: size },
    ],
    images: images ?? null,
  };
}

const tee = {
  thumbnail: blackUrl,
  images: [{ url: blackUrl }, { url: whiteUrl }],
  variants: [
    variant("variant_black_m", "Black", "M", [{ url: blackUrl }]),
    variant("variant_white_m", "White", "M", [{ url: whiteUrl }]),
  ],
};

describe("pickProductImage", () => {
  test("uses the image of a variant matching the selection", () => {
    expect(pickProductImage(tee, { [colourId]: "White" })).toBe(whiteUrl);
  });

  test("falls back to thumbnail, then first image, then null", () => {
    const variantWithoutImages = {
      ...tee,
      variants: [variant("variant_black_m", "Black", "M")],
    };
    expect(pickProductImage(variantWithoutImages, { [colourId]: "Black" })).toBe(blackUrl);

    const noThumbnail = {
      ...variantWithoutImages,
      thumbnail: null,
      images: [{ url: firstImageUrl }, { url: whiteUrl }],
    };
    expect(pickProductImage(noThumbnail, { [colourId]: "Black" })).toBe(firstImageUrl);

    const nothing = { thumbnail: null, images: null, variants: null };
    expect(pickProductImage(nothing, {})).toBeNull();
  });
});
