import {
  PLAN_PAGE_FALLBACK_SIDE,
  PLAN_PAGE_MAX_SIDE,
  PLAN_PNG_MAX_BYTES,
} from "@/server/domain/plans";

import { targetDimensions } from "../photos/resize";

/** Encoding chosen for a page image. */
export type PageFormat = "image/png" | "image/jpeg";

/**
 * Plans are line drawings: PNG keeps the lines sharp and is usually small. A PNG above 8 MB
 * (dense hatching, scanned plan) is re-encoded as JPEG at quality 0.9.
 */
export function choosePageFormat(pngBytes: number): PageFormat {
  return pngBytes <= PLAN_PNG_MAX_BYTES ? "image/png" : "image/jpeg";
}

/** Target size of a page image: 3 500 px on the longest side (never upscaled beyond). */
export function pageTargetSize(
  source: { width: number; height: number },
  maxSide = PLAN_PAGE_MAX_SIDE,
) {
  return targetDimensions(source, maxSide);
}

/**
 * Scale to apply to a PDF page viewport (in PDF points at scale 1) so that its longest side
 * becomes `maxSide` pixels. PDF pages are always rendered at that size, even small ones, so
 * that zooming on a tablet stays sharp.
 */
export function pdfRenderScale(
  viewport: { width: number; height: number },
  maxSide: number,
): number {
  return maxSide / Math.max(viewport.width, viewport.height);
}

/** Sides tried in order when a render fails (canvas too large, memory). */
export const RENDER_SIDES = [PLAN_PAGE_MAX_SIDE, PLAN_PAGE_FALLBACK_SIDE] as const;

/**
 * Runs `render` at 3 500 px, then once more at 2 500 px when the first attempt throws (out of
 * memory, canvas over the browser limit). The second failure is rethrown.
 */
export async function withRenderFallback<T>(render: (maxSide: number) => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (const side of RENDER_SIDES) {
    try {
      return await render(side);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}
