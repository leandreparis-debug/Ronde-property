import path from "node:path";

import { renderToBuffer } from "@react-pdf/renderer";
import sharp from "sharp";

import { ReportDocument, type ReportImages } from "@/lib/report/pdf/document";
import { registerReportFonts } from "@/lib/report/pdf/fonts";
import type { ReportModel } from "@/lib/report/model";

const FONTS_DIR = path.join(process.cwd(), "public/fonts/report");

/** Synthetic JPEG photo (gradient and shapes), never a real picture. */
export async function syntheticPhoto(seed: number, width = 1600, height = 1200): Promise<Buffer> {
  const hue = (seed * 47) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${hue},55%,62%)"/><stop offset="1" stop-color="hsl(${(hue + 80) % 360},45%,35%)"/>
    </linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <circle cx="${width * 0.3}" cy="${height * 0.4}" r="${height * 0.2}" fill="#ffffff" fill-opacity="0.35"/>
    <rect x="${width * 0.55}" y="${height * 0.5}" width="${width * 0.3}" height="${height * 0.3}" fill="#121317" fill-opacity="0.25"/>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 80 }).toBuffer();
}

/** Synthetic plan page (PNG line drawing). */
export async function syntheticPlan(width = 1414, height = 1000): Promise<Buffer> {
  const cells = Array.from({ length: 12 }, (_, i) => {
    const x = 120 + (i % 4) * 280;
    const y = 160 + Math.floor(i / 4) * 220;
    return `<rect x="${x}" y="${y}" width="260" height="200" fill="none" stroke="#121317" stroke-width="3"/>`;
  }).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="100%" height="100%" fill="#ffffff"/>${cells}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** Data URI image for the PDF. */
export function dataUri(buffer: Buffer, mime: "image/jpeg" | "image/png") {
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

/** Loaded images for every image of the model (photos and plan pages). */
export async function imagesFor(model: ReportModel, missing: string[] = []): Promise<ReportImages> {
  const images: ReportImages = {};
  const all = [
    ...(model.cover.photo ? [model.cover.photo] : []),
    ...model.figures.map((figure) => figure.image),
    ...model.plans.map((plan) => plan.image),
  ];
  let seed = 0;
  for (const image of all) {
    if (images[image.key] !== undefined) continue;
    if (missing.includes(image.key)) {
      images[image.key] = null;
      continue;
    }
    seed += 1;
    if (image.key.startsWith("page:")) {
      images[image.key] = {
        src: dataUri(await syntheticPlan(), "image/png"),
        width: 1414,
        height: 1000,
      };
    } else {
      images[image.key] = {
        src: dataUri(await syntheticPhoto(seed, 800, 600), "image/jpeg"),
        width: 800,
        height: 600,
      };
    }
  }
  return images;
}

/** Renders the report in Node with the local fonts. */
export async function renderPdf(model: ReportModel, images: ReportImages): Promise<Buffer> {
  registerReportFonts((file) => path.join(FONTS_DIR, file));
  return renderToBuffer(<ReportDocument model={model} images={images} />);
}

/** Opens a PDF with pdf.js: page count, text per page, metadata. */
export async function readPdf(buffer: Buffer) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const document = await pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: false })
    .promise;
  const pages: string[] = [];
  for (let index = 1; index <= document.numPages; index += 1) {
    const page = await document.getPage(index);
    const content = await page.getTextContent();
    pages.push(
      content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ")
        .replace(/\s+/g, " "),
    );
  }
  const metadata = await document.getMetadata();
  await document.cleanup();
  return {
    pageCount: pages.length,
    pages,
    text: pages.join("\n"),
    info: metadata.info as Record<string, unknown>,
  };
}
