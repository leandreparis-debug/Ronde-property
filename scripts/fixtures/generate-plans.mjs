/**
 * Generates the synthetic test plans of step 8 (no real plan, ever):
 *   - plan-a1-3-pages.pdf : vector PDF, 3 pages A1 landscape that look like a warehouse plan
 *     (cells, numbered docks, « PLAN DE TEST » title block) ;
 *   - plan-5000x3500.png : PNG plan of 5 000 × 3 500 px (resized to 3 500 px on import) ;
 *   - plan-21-pages.pdf : 21 pages, above the 20-page limit ;
 *   - plan-corrupted.pdf : starts with %PDF- but cannot be parsed (protected or damaged) ;
 *   - fake-plan.pdf : a text file named .pdf.
 *
 * Usage: node scripts/fixtures/generate-plans.mjs [outDir]   (default: e2e/fixtures/plans)
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.resolve(process.argv[2] ?? path.join(ROOT, "e2e", "fixtures", "plans"));

// A1 landscape in PDF points (841 × 594 mm).
const A1 = [2384, 1684];
const INK = rgb(0.07, 0.07, 0.09);
const GREY = rgb(0.55, 0.56, 0.6);
const BLUE = rgb(0.18, 0.42, 1);

/** Draws one warehouse-like sheet: outline, grid of cells, docks, title block. */
function drawSheet(page, font, bold, sheet, sheets) {
  const [width, height] = A1;
  const margin = 80;
  page.drawRectangle({
    x: margin,
    y: margin,
    width: width - margin * 2,
    height: height - margin * 2,
    borderColor: INK,
    borderWidth: 4,
  });
  const building = { x: 260, y: 320, w: 1600, h: 1000 };
  page.drawRectangle({
    x: building.x,
    y: building.y,
    width: building.w,
    height: building.h,
    borderColor: INK,
    borderWidth: 6,
  });
  // Cells 4 × 3.
  for (let i = 1; i < 4; i += 1) {
    const x = building.x + (building.w / 4) * i;
    page.drawLine({
      start: { x, y: building.y },
      end: { x, y: building.y + building.h },
      thickness: 2,
      color: GREY,
    });
  }
  for (let j = 1; j < 3; j += 1) {
    const y = building.y + (building.h / 3) * j;
    page.drawLine({
      start: { x: building.x, y },
      end: { x: building.x + building.w, y },
      thickness: 2,
      color: GREY,
    });
  }
  let cell = 1;
  for (let j = 2; j >= 0; j -= 1) {
    for (let i = 0; i < 4; i += 1) {
      page.drawText(`Cellule ${sheet}.${cell}`, {
        x: building.x + (building.w / 4) * i + 40,
        y: building.y + (building.h / 3) * j + building.h / 6,
        size: 34,
        font,
        color: GREY,
      });
      cell += 1;
    }
  }
  // Docks along the bottom side.
  const docks = 16;
  for (let d = 0; d < docks; d += 1) {
    const x = building.x + 40 + d * ((building.w - 80) / docks);
    page.drawRectangle({
      x,
      y: building.y - 90,
      width: 60,
      height: 90,
      borderColor: BLUE,
      borderWidth: 3,
    });
    page.drawText(String(d + 1 + (sheet - 1) * docks), {
      x: x + 12,
      y: building.y - 140,
      size: 30,
      font: bold,
      color: BLUE,
    });
  }
  page.drawText("Quais", { x: building.x, y: building.y - 200, size: 36, font: bold, color: BLUE });
  // Title block.
  const tb = { x: width - margin - 520, y: margin, w: 520, h: 300 };
  page.drawRectangle({
    x: tb.x,
    y: tb.y,
    width: tb.w,
    height: tb.h,
    borderColor: INK,
    borderWidth: 4,
  });
  page.drawText("PLAN DE TEST", { x: tb.x + 30, y: tb.y + 220, size: 48, font: bold, color: INK });
  page.drawText("Entrepôt fictif — données synthétiques".normalize("NFD").replace(/[̀-ͯ]/g, ""), {
    x: tb.x + 30,
    y: tb.y + 160,
    size: 24,
    font,
    color: INK,
  });
  page.drawText(`Folio ${sheet} / ${sheets} — echelle 1:500`, {
    x: tb.x + 30,
    y: tb.y + 110,
    size: 26,
    font,
    color: INK,
  });
  page.drawText("RONDE · etape 8", { x: tb.x + 30, y: tb.y + 60, size: 26, font, color: GREY });
  // North arrow.
  page.drawLine({
    start: { x: 2050, y: 1350 },
    end: { x: 2050, y: 1500 },
    thickness: 6,
    color: INK,
  });
  page.drawText("N", { x: 2035, y: 1515, size: 48, font: bold, color: INK });
}

async function pdf(pages) {
  const doc = await PDFDocument.create();
  doc.setTitle("Plan de test RONDE");
  doc.setProducer("generate-plans.mjs");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  for (let sheet = 1; sheet <= pages; sheet += 1) {
    const page = doc.addPage(A1);
    drawSheet(page, font, bold, sheet, pages);
  }
  return doc.save();
}

function pngPlanSvg(width, height) {
  const cells = [];
  for (let i = 1; i < 6; i += 1)
    cells.push(
      `<line x1="${(width / 6) * i}" y1="400" x2="${(width / 6) * i}" y2="${height - 600}" stroke="#8c8f99" stroke-width="6"/>`,
    );
  for (let d = 0; d < 24; d += 1) {
    const x = 300 + d * ((width - 600) / 24);
    cells.push(
      `<rect x="${x}" y="${height - 600}" width="90" height="140" fill="none" stroke="#2f6aff" stroke-width="8"/>`,
    );
    cells.push(
      `<text x="${x + 20}" y="${height - 380}" font-family="sans-serif" font-size="60" fill="#2f6aff">${d + 1}</text>`,
    );
  }
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <rect width="${width}" height="${height}" fill="#ffffff"/>
  <rect x="120" y="120" width="${width - 240}" height="${height - 240}" fill="none" stroke="#121317" stroke-width="12"/>
  <rect x="300" y="400" width="${width - 600}" height="${height - 1000}" fill="none" stroke="#121317" stroke-width="16"/>
  ${cells.join("\n  ")}
  <text x="${width - 1500}" y="${height - 200}" font-family="sans-serif" font-size="110" font-weight="700" fill="#121317">PLAN DE TEST</text>
</svg>`);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  await writeFile(path.join(OUT, "plan-a1-3-pages.pdf"), await pdf(3));
  await writeFile(path.join(OUT, "plan-21-pages.pdf"), await pdf(21));
  await writeFile(
    path.join(OUT, "plan-5000x3500.png"),
    await sharp(pngPlanSvg(5000, 3500)).png({ compressionLevel: 9, palette: true }).toBuffer(),
  );
  // Valid signature, broken body: pdf.js refuses it like a damaged or protected file.
  await writeFile(
    path.join(OUT, "plan-corrupted.pdf"),
    Buffer.concat([
      Buffer.from("%PDF-1.7\n%\xE2\xE3\xCF\xD3\n", "binary"),
      Buffer.alloc(4096, 0x41),
      Buffer.from("\n%%EOF\n"),
    ]),
  );
  await writeFile(
    path.join(OUT, "fake-plan.pdf"),
    "Ceci n'est pas un plan : un simple fichier texte renommé en .pdf.\n",
  );
  console.log(`Plans de test générés dans ${OUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
