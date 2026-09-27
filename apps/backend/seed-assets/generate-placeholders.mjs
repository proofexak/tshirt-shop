// One-off generator for the seed catalog's placeholder photos.
//
// Produces 6 flat 600x600 PNGs (3 premade products x 2 colours): a simple
// t-shirt/hoodie silhouette in the product's colour on a light-grey
// background, labelled with the product name. Run manually when the
// placeholders need regenerating; the seed script itself never runs this —
// it just uploads the committed PNGs below.
//
// Usage: node apps/backend/seed-assets/generate-placeholders.mjs

import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SIZE = 600;
const BACKGROUND = "#e0e0e0";

const PRODUCTS = [
  { handle: "classic-crew-tee", title: "Classic Crew Tee" },
  { handle: "v-neck-tee", title: "V-Neck Tee" },
  { handle: "basic-hoodie", title: "Basic Hoodie" },
];

const COLOURS = [
  { name: "black", fill: "#1a1a1a", label: "#f5f5f5" },
  { name: "white", fill: "#f5f5f5", label: "#1a1a1a" },
];

// A plain t-shirt silhouette (collar notch, shoulders, sleeves, hem),
// centred in the 600x600 canvas.
const SHIRT_PATH = `
  M 230 130
  L 300 160
  L 370 130
  L 430 190
  L 385 245
  L 355 215
  L 355 480
  L 245 480
  L 245 215
  L 215 245
  L 170 190
  Z
`;

function svgFor({ title, fill, label }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <rect width="${SIZE}" height="${SIZE}" fill="${BACKGROUND}" />
  <path d="${SHIRT_PATH}" fill="${fill}" stroke="#00000022" stroke-width="3" />
  <text x="${SIZE / 2}" y="540" font-family="sans-serif" font-size="32" font-weight="600"
        text-anchor="middle" fill="#333333">${title}</text>
</svg>`;
}

async function main() {
  await mkdir(__dirname, { recursive: true });

  for (const product of PRODUCTS) {
    for (const colour of COLOURS) {
      const svg = svgFor({
        title: product.title,
        fill: colour.fill,
        label: colour.label,
      });
      const outPath = path.join(
        __dirname,
        `${product.handle}-${colour.name}.png`
      );
      await sharp(Buffer.from(svg))
        .png({ compressionLevel: 9 })
        .toFile(outPath);
      console.log(`Wrote ${outPath}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
