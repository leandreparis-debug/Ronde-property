/**
 * Plan domain constants shared by the server, the browser conversion and the interface.
 * No database access here.
 */

/** Maximum size of the original file (PDF or image). */
export const MAX_PLAN_BYTES = 50 * 1024 * 1024;
/** Maximum number of pages of a PDF. */
export const MAX_PLAN_PAGES = 20;
/** Longest side of a page image, in pixels, and the fallback when the canvas is too large. */
export const PLAN_PAGE_MAX_SIDE = 3500;
export const PLAN_PAGE_FALLBACK_SIDE = 2500;
/** Longest side of a page thumbnail. */
export const PLAN_THUMB_MAX_SIDE = 400;
/** A PNG page above this size is re-encoded as JPEG (quality 0.9). */
export const PLAN_PNG_MAX_BYTES = 8 * 1024 * 1024;
export const PLAN_JPEG_QUALITY = 0.9;
export const PLAN_THUMB_JPEG_QUALITY = 0.7;
/** Length limits of the plan name and the marker label. */
export const PLAN_NAME_MAX_LENGTH = 120;
export const MARKER_LABEL_MAX_LENGTH = 80;
/** Decimals kept for the relative coordinates (numeric(6,5) in the database). */
export const MARKER_COORDINATE_DECIMALS = 5;

export const UNSUPPORTED_PLAN_MESSAGE =
  "Format non pris en charge : utilisez un PDF, un PNG ou un JPEG.";
export const UNREADABLE_PDF_MESSAGE = "Ce PDF ne peut pas être lu (protégé ou endommagé).";
export const TOO_MANY_PAGES_MESSAGE = `Ce PDF dépasse ${MAX_PLAN_PAGES} pages.`;
export const PLAN_TOO_LARGE_MESSAGE = "Fichier trop lourd (50 Mo maximum).";
export const RENDER_FAILED_MESSAGE =
  "La conversion a échoué : le plan est trop lourd pour cet appareil. Réessayez sur un PC.";

/** Rounds a relative coordinate to the database precision, clamped to 0..1. */
export function roundCoordinate(value: number): number {
  const clamped = Math.min(1, Math.max(0, value));
  const factor = 10 ** MARKER_COORDINATE_DECIMALS;
  return Math.round(clamped * factor) / factor;
}

/** Name of a plan derived from a file name: extension removed, trimmed, 120 characters. */
export function planNameFromFilename(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? "";
  const stem = base
    .replace(/\.[^.]+$/, "")
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return stem.slice(0, PLAN_NAME_MAX_LENGTH) || "Plan";
}

/** Plural-aware « N page(s) » label. */
export function pagesLabel(count: number): string {
  return `${count} page${count > 1 ? "s" : ""}`;
}

/** Plural-aware « N repère(s) » label. */
export function markersLabel(count: number): string {
  return `${count} repère${count > 1 ? "s" : ""}`;
}

/** Label of the incomplete point about markers without a photo. */
export function markersWithoutPhotoLabel(count: number): string {
  return `${count} repère${count > 1 ? "s" : ""} sans photo`;
}
