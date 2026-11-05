import type { LoadedImage, ReportImages } from "./pdf/document";
import type { ReportImage } from "./types";

/** Longest side of a photo in « Légère » quality. */
export const LIGHT_MAX_SIDE = 1000;
/** JPEG quality of the reduced photos. */
export const LIGHT_JPEG_QUALITY = 0.78;
/** Parallel downloads. */
export const IMAGE_CONCURRENCY = 4;

export interface LoadImagesOptions {
  quality: "standard" | "light";
  signal: AbortSignal;
  /** Called after each image (loaded or not). */
  onProgress: (done: number, total: number) => void;
  /** Fresh URLs for keys whose URL failed (expired signature). */
  renew: (keys: string[]) => Promise<Record<string, string>>;
}

/** Outcome: images keyed by `ReportImage.key`, and the keys that could not be loaded. */
export interface LoadImagesResult {
  images: ReportImages;
  missing: string[];
}

/**
 * Runs `worker` on every item with at most `limit` calls in flight, in order of the list.
 * Rejects as soon as the signal is aborted.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
  signal?: AbortSignal,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function lane() {
    while (next < items.length) {
      if (signal?.aborted) throw new DOMException("Génération annulée.", "AbortError");
      const index = next;
      next += 1;
      results[index] = await worker(items[index]!, index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
  return results;
}

function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Lecture impossible."));
    reader.readAsDataURL(blob);
  });
}

async function fetchBlob(url: string, signal: AbortSignal): Promise<Blob | null> {
  const response = await fetch(url, { signal, cache: "no-store" });
  if (!response.ok) return null;
  return response.blob();
}

/** Decodes an image blob; for « Légère » photos, reduces it to 1 000 px JPEG by canvas. */
async function prepare(blob: Blob, reduce: boolean): Promise<LoadedImage> {
  const bitmap = await createImageBitmap(blob);
  try {
    const { width, height } = bitmap;
    const scale = reduce ? Math.min(1, LIGHT_MAX_SIDE / Math.max(width, height)) : 1;
    if (scale >= 1 && /^image\/(jpeg|png)$/.test(blob.type)) {
      return { src: await blobToDataUri(blob), width, height };
    }
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas indisponible.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, targetWidth, targetHeight);
    context.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
    const jpeg = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (result) => (result ? resolve(result) : reject(new Error("Conversion impossible."))),
        "image/jpeg",
        LIGHT_JPEG_QUALITY,
      ),
    );
    canvas.width = 0;
    canvas.height = 0;
    return { src: await blobToDataUri(jpeg), width: targetWidth, height: targetHeight };
  } finally {
    bitmap.close();
  }
}

/**
 * Loads the images of a report in the browser, 4 at a time: signed URL, renewed once when it
 * fails (expired during a long generation); photos reduced to 1 000 px in « Légère » (plans
 * keep their resolution). An image that cannot be loaded is `null` (« Photo indisponible »)
 * and listed in `missing`: the generation goes on.
 */
export async function loadReportImages(
  sources: ReportImage[],
  options: LoadImagesOptions,
): Promise<LoadImagesResult> {
  const unique = [...new Map(sources.map((image) => [image.key, image])).values()];
  const images: ReportImages = {};
  const missing: string[] = [];
  let done = 0;
  options.onProgress(0, unique.length);
  await mapWithConcurrency(
    unique,
    IMAGE_CONCURRENCY,
    async (image) => {
      const reduce = options.quality === "light" && image.key.startsWith("photo:");
      try {
        let blob = image.url
          ? await fetchBlob(image.url, options.signal).catch(rethrowAbort)
          : null;
        if (!blob) {
          const fresh = await options.renew([image.key]);
          const url = fresh[image.key];
          blob = url ? await fetchBlob(url, options.signal).catch(rethrowAbort) : null;
        }
        images[image.key] = blob ? await prepare(blob, reduce) : null;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") throw error;
        images[image.key] = null;
      }
      if (!images[image.key]) missing.push(image.key);
      done += 1;
      options.onProgress(done, unique.length);
    },
    options.signal,
  );
  return { images, missing };
}

function rethrowAbort(error: unknown): null {
  if (error instanceof DOMException && error.name === "AbortError") throw error;
  return null;
}
