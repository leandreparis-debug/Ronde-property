/**
 * Generates the synthetic test images of the photo step (no real photo, ever):
 *   - exif-orientation-6.jpg : 400 × 600 pixels stored sideways, EXIF orientation 6 (shown as
 *     600 × 400 once rotated), DateTimeOriginal and fake GPS tags (to prove they are dropped) ;
 *   - gradient.png : 1200 × 900 PNG gradient with transparency ;
 *   - shapes.webp : 900 × 900 WebP with shapes ;
 *   - large-4000x3000.jpg : 4000 × 3000 JPEG (must come out under 1600 px and 1 MB) ;
 *   - fake.jpg : a text file with a .jpg extension (refused by the magic bytes) ;
 *   - fake.heic : HEIC magic bytes only (refused with the format message).
 *
 * Usage: node scripts/fixtures/generate-images.mjs [outDir]   (default: e2e/fixtures/images)
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.resolve(process.argv[2] ?? path.join(ROOT, "e2e", "fixtures", "images"));

/** SVG with a gradient, a few shapes and an optional « TEST » label. */
function scene(width, height, { label = "TEST", from = "#2f6aff", to = "#e8a400" } = {}) {
  const r = Math.min(width, height) / 6;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${from}"/>
      <stop offset="1" stop-color="${to}"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#g)"/>
  <circle cx="${width * 0.3}" cy="${height * 0.35}" r="${r}" fill="#ffffff" fill-opacity="0.85"/>
  <rect x="${width * 0.55}" y="${height * 0.5}" width="${r * 2}" height="${r * 1.4}" fill="#121317" fill-opacity="0.75"/>
  <polygon points="${width * 0.15},${height * 0.9} ${width * 0.3},${height * 0.6} ${width * 0.45},${height * 0.9}" fill="#23704a"/>
  ${
    label
      ? `<text x="${width / 2}" y="${height * 0.2}" font-family="sans-serif" font-size="${r}" font-weight="700" text-anchor="middle" fill="#ffffff">${label}</text>`
      : ""
  }
</svg>`);
}

async function main() {
  await mkdir(OUT, { recursive: true });

  // Portrait pixels + orientation 6: a viewer honouring EXIF shows a 600 × 400 landscape.
  const sideways = await sharp(scene(400, 600, { label: "EXIF 6" }))
    .jpeg({ quality: 90 })
    .withMetadata({ orientation: 6 })
    .withExif({
      IFD0: { Make: "RONDE fixtures", Model: "Synthetic camera", Software: "generate-images.mjs" },
      IFD2: { DateTimeOriginal: "2026:05:04 10:30:00", CreateDate: "2026:05:04 10:30:00" },
      IFD3: {
        GPSLatitudeRef: "N",
        GPSLatitude: "48/1 51/1 2400/100",
        GPSLongitudeRef: "E",
        GPSLongitude: "2/1 21/1 300/100",
      },
    })
    .toBuffer();
  await writeFile(path.join(OUT, "exif-orientation-6.jpg"), sideways);

  await writeFile(
    path.join(OUT, "gradient.png"),
    await sharp(scene(1200, 900, { label: "PNG", from: "#23704a", to: "#e7eeff" }))
      .ensureAlpha(0.9)
      .png({ compressionLevel: 9 })
      .toBuffer(),
  );

  await writeFile(
    path.join(OUT, "shapes.webp"),
    await sharp(scene(900, 900, { label: "WEBP", from: "#c0341f", to: "#2f6aff" }))
      .webp({ quality: 85 })
      .toBuffer(),
  );

  await writeFile(
    path.join(OUT, "large-4000x3000.jpg"),
    await sharp(scene(4000, 3000, { label: "4000 × 3000" }))
      .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
      .toBuffer(),
  );

  await writeFile(
    path.join(OUT, "fake.jpg"),
    "Ceci n'est pas une image : un simple fichier texte renommé en .jpg.\n",
  );

  // ISO BMFF header: size 24, « ftyp », major brand « heic », minor version, compatible brands.
  const heic = Buffer.concat([
    Buffer.from([0, 0, 0, 24]),
    Buffer.from("ftypheic", "ascii"),
    Buffer.from([0, 0, 0, 0]),
    Buffer.from("mif1heic", "ascii"),
    Buffer.alloc(64, 0),
  ]);
  await writeFile(path.join(OUT, "fake.heic"), heic);

  console.log(`Images de test générées dans ${OUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
