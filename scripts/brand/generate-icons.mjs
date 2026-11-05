/**
 * Generates the icons and the iOS splash screens of the installable application from the
 * mascot (« Galet », same outline as `src/components/brand/Galet.tsx`) and the colour tokens of
 * `src/app/globals.css`. The output is committed; run the script again after a change of the
 * mascot or of a token:
 *
 *   node scripts/brand/generate-icons.mjs
 *
 * Output:
 *   public/icons/icon-192.png, icon-512.png   tile icons (purpose « any »)
 *   public/icons/icon-maskable-512.png        full-bleed icon, mascot inside the 80 % safe zone
 *   src/app/apple-icon.png                     180 × 180, linked by Next.js (apple-touch-icon)
 *   src/app/favicon.ico                        16, 32 and 48 px (PNG in ICO)
 *   public/splash/ipad-{w}x{h}.png             iOS splash screens (iPad, portrait and landscape)
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Body outline of the mascot in its 100 × 100 box (GALET_BODY_PATH). */
const BODY = "M8 92 C 2 62, 16 26, 50 22 C 82 18, 98 48, 94 92 Z";

/** iPad screens in CSS pixels (portrait), same list as `src/lib/pwa.ts` (checked by a test). */
const IPAD_SCREENS = [
  { width: 768, height: 1024, ratio: 2 },
  { width: 810, height: 1080, ratio: 2 },
  { width: 820, height: 1180, ratio: 2 },
  { width: 834, height: 1194, ratio: 2 },
  { width: 1024, height: 1366, ratio: 2 },
];

async function tokens() {
  const css = await readFile(path.join(ROOT, "src/app/globals.css"), "utf8");
  const read = (name) => {
    const match = new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
    if (!match) throw new Error(`Token ${name} introuvable dans globals.css`);
    return match[1];
  };
  return {
    brand: read("--color-brand"),
    craie: read("--color-craie"),
    paper: read("--color-paper"),
    onBrand: read("--color-on-brand"),
  };
}

/** The neutral mascot, `size` px wide, its top-left corner at (x, y). */
function galet(c, x, y, size) {
  const s = size / 100;
  return `<g transform="translate(${x} ${y}) scale(${s})">
    <path d="${BODY}" fill="${c.brand}"/>
    <circle cx="58" cy="54" r="6" fill="${c.onBrand}"/>
    <circle cx="76" cy="54" r="6" fill="${c.onBrand}"/>
  </g>`;
}

const svg = (width, height, body) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`,
  );

/** Rounded paper tile, mascot leaning on the bottom edge (same drawing as `src/app/icon.svg`). */
function tile(c, size) {
  const radius = size / 4;
  return svg(
    size,
    size,
    `<clipPath id="t"><rect width="${size}" height="${size}" rx="${radius}"/></clipPath>
     <rect width="${size}" height="${size}" rx="${radius}" fill="${c.paper}"/>
     <g clip-path="url(#t)">${galet(c, size * 0.04, size * 0.14, size * 0.92)}</g>`,
  );
}

/** Square full-bleed background, mascot centred inside the safe zone (`ratio` of the side). */
function fullBleed(c, size, ratio, background) {
  const inner = size * ratio;
  // The drawing occupies y 18…92 of its box: centre it vertically.
  const offsetY = (size - inner * 0.74) / 2 - inner * 0.18;
  return svg(
    size,
    size,
    `<rect width="${size}" height="${size}" fill="${background}"/>${galet(c, (size - inner) / 2, offsetY, inner)}`,
  );
}

/** Splash screen: craie background, mascot in the middle. */
function splash(c, width, height) {
  const size = Math.round(Math.min(width, height) * 0.22);
  return svg(
    width,
    height,
    `<rect width="${width}" height="${height}" fill="${c.craie}"/>${galet(c, (width - size) / 2, (height - size) / 2 - size * 0.1, size)}`,
  );
}

const png = (buffer) => sharp(buffer).png({ compressionLevel: 9 }).toBuffer();

/** ICO container holding PNG images (supported by every current browser). */
function ico(images) {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, data }, index) => {
    const entry = 6 + 16 * index;
    header.writeUInt8(size >= 256 ? 0 : size, entry);
    header.writeUInt8(size >= 256 ? 0 : size, entry + 1);
    header.writeUInt8(0, entry + 2);
    header.writeUInt8(0, entry + 3);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(data.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...images.map((image) => image.data)]);
}

async function main() {
  const c = await tokens();
  const icons = path.join(ROOT, "public/icons");
  const splashDir = path.join(ROOT, "public/splash");
  await mkdir(icons, { recursive: true });
  await mkdir(splashDir, { recursive: true });

  const written = [];
  const out = async (file, data) => {
    await writeFile(file, data);
    written.push(path.relative(ROOT, file));
  };

  for (const size of [192, 512])
    await out(path.join(icons, `icon-${size}.png`), await png(tile(c, size)));
  await out(path.join(icons, "icon-maskable-512.png"), await png(fullBleed(c, 512, 0.62, c.craie)));
  await out(path.join(ROOT, "src/app/apple-icon.png"), await png(fullBleed(c, 180, 0.78, c.paper)));
  const favicons = [];
  for (const size of [16, 32, 48]) favicons.push({ size, data: await png(tile(c, size)) });
  await out(path.join(ROOT, "src/app/favicon.ico"), ico(favicons));

  for (const screen of IPAD_SCREENS) {
    const w = screen.width * screen.ratio;
    const h = screen.height * screen.ratio;
    await out(path.join(splashDir, `ipad-${w}x${h}.png`), await png(splash(c, w, h)));
    await out(path.join(splashDir, `ipad-${h}x${w}.png`), await png(splash(c, h, w)));
  }
  console.log(written.join("\n"));
}

await main();
