import {
  MAX_PHOTO_BYTES,
  PHOTO_JPEG_QUALITY,
  PHOTO_MAX_SIDE,
  sanitizeFilename,
  THUMB_JPEG_QUALITY,
  THUMB_MAX_SIDE,
  TOO_LARGE_MESSAGE,
  UNSUPPORTED_FORMAT_MESSAGE,
} from "@/server/domain/photos";

import { isHeic, MAGIC_BYTES_LENGTH, sniffImageType } from "./magic";
import { targetDimensions } from "./resize";

/** Result of the browser-side processing of one picked file. */
export interface ProcessedPhoto {
  /** JPEG, 1600 px on the longest side, quality 0.8, without EXIF. */
  main: Blob;
  /** JPEG, 400 px on the longest side, quality 0.7. */
  thumb: Blob;
  /** Dimensions of `main`, after the EXIF orientation was applied. */
  width: number;
  height: number;
  /** EXIF `DateTimeOriginal` as ISO 8601, or `null` when absent. */
  takenAt: string | null;
  originalFilename: string | null;
}

/** A file refused before any upload; `message` is shown as is. */
export class PhotoProcessingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PhotoProcessingError";
  }
}

/** Reads the first bytes of a blob. */
export async function readMagicBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.slice(0, MAGIC_BYTES_LENGTH).arrayBuffer());
}

/** Reads the EXIF date of capture, in ISO 8601, with `exifr`. Never throws. */
export async function readTakenAt(blob: Blob): Promise<string | null> {
  try {
    const { parse } = await import("exifr");
    const data = (await parse(blob, {
      pick: ["DateTimeOriginal", "CreateDate"],
      translateValues: true,
      reviveValues: true,
    })) as { DateTimeOriginal?: unknown; CreateDate?: unknown } | undefined;
    const raw = data?.DateTimeOriginal ?? data?.CreateDate;
    if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw.toISOString();
    if (typeof raw === "string") {
      const parsed = parseExifDate(raw);
      if (parsed) return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/** Parses « YYYY:MM:DD HH:MM:SS » (local time of the device) to ISO 8601. */
export function parseExifDate(value: string): string | null {
  const match = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(value.trim());
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match;
  const date = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

type Canvas2D = OffscreenCanvas | HTMLCanvasElement;

function createCanvas(width: number, height: number): Canvas2D {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function canvasToJpeg(canvas: Canvas2D, quality: number): Promise<Blob> {
  if ("convertToBlob" in canvas) {
    return canvas.convertToBlob({ type: "image/jpeg", quality });
  }
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob a échoué."))),
      "image/jpeg",
      quality,
    );
  });
}

/** Draws `source` into a fresh canvas of the target size and encodes it as JPEG. */
async function encode(
  source: ImageBitmap,
  maxSide: number,
  quality: number,
): Promise<{ blob: Blob; width: number; height: number }> {
  const { width, height } = targetDimensions(
    { width: source.width, height: source.height },
    maxSide,
  );
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d") as
    OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
  if (!context) throw new PhotoProcessingError("Impossible de préparer l'image.");
  // JPEG has no transparency: PNG and WebP alpha become white, like on paper.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(source, 0, 0, width, height);
  return { blob: await canvasToJpeg(canvas, quality), width, height };
}

/**
 * Processes one picked file in the browser: magic bytes, EXIF date, decode with the EXIF
 * orientation applied, resize to 1600 px and 400 px, encode as JPEG (which drops every EXIF
 * tag, GPS included). Works in a Web Worker (OffscreenCanvas) or on the main thread.
 *
 * @throws {PhotoProcessingError} with a message safe to show for the file.
 */
export async function processImageFile(
  file: Blob,
  filename?: string | null,
): Promise<ProcessedPhoto> {
  const magic = await readMagicBytes(file);
  const type = sniffImageType(magic);
  // HEIC is detected only to keep the refusal explicit in the logs of the tests: the user
  // message is the same for every unsupported format.
  if (!type || isHeic(magic)) throw new PhotoProcessingError(UNSUPPORTED_FORMAT_MESSAGE);
  const takenAt = type === "image/jpeg" ? await readTakenAt(file) : null;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new PhotoProcessingError(UNSUPPORTED_FORMAT_MESSAGE);
  }
  try {
    const main = await encode(bitmap, PHOTO_MAX_SIDE, PHOTO_JPEG_QUALITY);
    const thumb = await encode(bitmap, THUMB_MAX_SIDE, THUMB_JPEG_QUALITY);
    if (main.blob.size > MAX_PHOTO_BYTES || thumb.blob.size > MAX_PHOTO_BYTES) {
      throw new PhotoProcessingError(TOO_LARGE_MESSAGE);
    }
    return {
      main: main.blob,
      thumb: thumb.blob,
      width: main.width,
      height: main.height,
      takenAt,
      originalFilename: sanitizeFilename(filename ?? (file instanceof File ? file.name : null)),
    };
  } finally {
    bitmap.close();
  }
}
