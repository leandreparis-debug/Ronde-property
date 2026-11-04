import {
  MAX_PLAN_PAGES,
  PLAN_JPEG_QUALITY,
  PLAN_PAGE_MAX_SIDE,
  PLAN_THUMB_JPEG_QUALITY,
  PLAN_THUMB_MAX_SIDE,
  RENDER_FAILED_MESSAGE,
  TOO_MANY_PAGES_MESSAGE,
  UNREADABLE_PDF_MESSAGE,
  UNSUPPORTED_PLAN_MESSAGE,
} from "@/server/domain/plans";

import { targetDimensions } from "../photos/resize";
import { choosePageFormat, type PageFormat, pdfRenderScale, withRenderFallback } from "./format";

/** A refusal or failure of the conversion; `message` is shown as is. */
export class PlanConversionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanConversionError";
  }
}

/** One converted page: display image (3 500 px), thumbnail (400 px) and their metadata. */
export interface RenderedPage {
  pageNumber: number;
  image: Blob;
  imageMime: PageFormat;
  thumb: Blob;
  width: number;
  height: number;
}

/** A source ready to be converted page by page (PDF or image). */
export interface PlanSource {
  pageCount: number;
  /** Renders one page at 3 500 px (2 500 px on failure), encodes it and makes its thumbnail. */
  renderPage(pageNumber: number): Promise<RenderedPage>;
  /** Object URL of a small JPEG preview of a page (400 px), for the import dialog. */
  renderPreview(pageNumber: number): Promise<string>;
  /** Releases the PDF document or the decoded image. */
  destroy(): void;
}

/** Draws a source onto a white 400 px canvas and returns an object URL of its JPEG. */
async function previewFrom(
  draw: (context: CanvasRenderingContext2D, width: number, height: number) => Promise<void> | void,
  size: { width: number; height: number },
): Promise<string> {
  const target = targetDimensions(size, PLAN_THUMB_MAX_SIDE);
  const canvas = createCanvas(target.width, target.height);
  try {
    const context = context2d(canvas);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, target.width, target.height);
    await draw(context, target.width, target.height);
    return URL.createObjectURL(await toBlob(canvas, "image/jpeg", PLAN_THUMB_JPEG_QUALITY));
  } finally {
    release(canvas);
  }
}

type PdfJs = typeof import("pdfjs-dist");
let pdfjsPromise: Promise<PdfJs> | null = null;

/**
 * Loads pdf.js once, with its worker bundled by Next.js from `node_modules` (served by the
 * application itself: no CDN at runtime). Parsing runs in that worker; drawing happens on a
 * canvas of the page, one page at a time.
 */
async function loadPdfJs(): Promise<PdfJs> {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((pdfjs) => {
      if (!pdfjs.GlobalWorkerOptions.workerPort) {
        pdfjs.GlobalWorkerOptions.workerPort = new Worker(
          new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url),
          { type: "module" },
        );
      }
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new PlanConversionError(RENDER_FAILED_MESSAGE);
  return context;
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new PlanConversionError(RENDER_FAILED_MESSAGE))),
      type,
      quality,
    );
  });
}

/** Frees the memory of a canvas right away (Safari keeps it until garbage collection). */
function release(canvas: HTMLCanvasElement) {
  canvas.width = 0;
  canvas.height = 0;
}

/**
 * Encodes a rendered page: PNG, or JPEG 0.9 when the PNG exceeds 8 MB; then a 400 px JPEG
 * thumbnail on a white background.
 */
async function encodePage(canvas: HTMLCanvasElement, pageNumber: number): Promise<RenderedPage> {
  const png = await toBlob(canvas, "image/png");
  const imageMime = choosePageFormat(png.size);
  const image =
    imageMime === "image/png" ? png : await toBlob(canvas, "image/jpeg", PLAN_JPEG_QUALITY);
  const size = targetDimensions(
    { width: canvas.width, height: canvas.height },
    PLAN_THUMB_MAX_SIDE,
  );
  const thumbCanvas = createCanvas(size.width, size.height);
  const thumbContext = context2d(thumbCanvas);
  thumbContext.fillStyle = "#ffffff";
  thumbContext.fillRect(0, 0, size.width, size.height);
  thumbContext.drawImage(canvas, 0, 0, size.width, size.height);
  const thumb = await toBlob(thumbCanvas, "image/jpeg", PLAN_THUMB_JPEG_QUALITY);
  release(thumbCanvas);
  return { pageNumber, image, imageMime, thumb, width: canvas.width, height: canvas.height };
}

/**
 * Opens a PDF: refuses protected, damaged and over-20-page files before any upload.
 *
 * @throws {PlanConversionError} with a message safe to show.
 */
export async function openPdfSource(file: Blob): Promise<PlanSource> {
  const pdfjs = await loadPdfJs();
  let document: Awaited<ReturnType<PdfJs["getDocument"]>["promise"]>;
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  try {
    document = await task.promise;
  } catch {
    void task.destroy();
    // Protected (PasswordException) and damaged (InvalidPDFException) files share one message.
    throw new PlanConversionError(UNREADABLE_PDF_MESSAGE);
  }
  if (document.numPages > MAX_PLAN_PAGES) {
    await task.destroy();
    throw new PlanConversionError(TOO_MANY_PAGES_MESSAGE);
  }
  return {
    pageCount: document.numPages,
    async renderPage(pageNumber) {
      const page = await document.getPage(pageNumber);
      try {
        return await withRenderFallback(async (maxSide) => {
          const viewport = page.getViewport({ scale: 1 });
          const scaled = page.getViewport({ scale: pdfRenderScale(viewport, maxSide) });
          const canvas = createCanvas(Math.round(scaled.width), Math.round(scaled.height));
          try {
            const context = context2d(canvas);
            // Some exports have a transparent background: force white, like paper.
            context.fillStyle = "#ffffff";
            context.fillRect(0, 0, canvas.width, canvas.height);
            await page.render({
              canvas,
              canvasContext: context,
              viewport: scaled,
              background: "#ffffff",
            }).promise;
            return await encodePage(canvas, pageNumber);
          } finally {
            release(canvas);
          }
        });
      } catch (error) {
        if (error instanceof PlanConversionError) throw error;
        throw new PlanConversionError(RENDER_FAILED_MESSAGE);
      } finally {
        page.cleanup();
      }
    },
    async renderPreview(pageNumber) {
      const page = await document.getPage(pageNumber);
      try {
        const base = page.getViewport({ scale: 1 });
        const scale = pdfRenderScale(base, PLAN_THUMB_MAX_SIDE);
        const viewport = page.getViewport({ scale });
        return await previewFrom(
          async (context) => {
            await page.render({
              canvas: context.canvas,
              canvasContext: context,
              viewport,
              background: "#ffffff",
            }).promise;
          },
          { width: Math.round(viewport.width), height: Math.round(viewport.height) },
        );
      } finally {
        page.cleanup();
      }
    },
    destroy() {
      void task.destroy();
    },
  };
}

/**
 * Opens a PNG or JPEG plan: decoded once, resized to 3 500 px on its longest side when larger.
 *
 * @throws {PlanConversionError} when the image cannot be decoded.
 */
export async function openImageSource(file: Blob): Promise<PlanSource> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new PlanConversionError(UNSUPPORTED_PLAN_MESSAGE);
  }
  return {
    pageCount: 1,
    async renderPage(pageNumber) {
      try {
        return await withRenderFallback(async (maxSide) => {
          const size = targetDimensions({ width: bitmap.width, height: bitmap.height }, maxSide);
          const canvas = createCanvas(size.width, size.height);
          try {
            const context = context2d(canvas);
            context.fillStyle = "#ffffff";
            context.fillRect(0, 0, size.width, size.height);
            context.drawImage(bitmap, 0, 0, size.width, size.height);
            return await encodePage(canvas, pageNumber);
          } finally {
            release(canvas);
          }
        });
      } catch {
        throw new PlanConversionError(RENDER_FAILED_MESSAGE);
      }
    },
    renderPreview() {
      return previewFrom(
        (context, width, height) => context.drawImage(bitmap, 0, 0, width, height),
        { width: bitmap.width, height: bitmap.height },
      );
    },
    destroy() {
      bitmap.close();
    },
  };
}

/** Default maximum side, re-exported for the tests. */
export const DEFAULT_PAGE_SIDE = PLAN_PAGE_MAX_SIDE;
