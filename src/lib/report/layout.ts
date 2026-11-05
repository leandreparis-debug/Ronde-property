/*
 * Geometry of the report, in PDF points (1 pt = 1/72 in). Pure functions, unit tested: page
 * sizes, photo grids, plan fitting and marker positions.
 */

/** A4 portrait, in points. */
export const A4 = { width: 595.28, height: 841.89 } as const;
/** 18 mm margins. */
export const MARGIN = (18 / 25.4) * 72;
/** Height reserved for the running header (blue rule and section name). */
export const HEADER_HEIGHT = 22;
/** Height reserved for the footer (two lines). */
export const FOOTER_HEIGHT = 28;
/** Size of a marker drawn on a plan (same proportions as on screen: 36 px). */
export const PDF_MARKER_SIZE = 16;

export type Orientation = "portrait" | "landscape";

/** Page size for an orientation. */
export function pageSize(orientation: Orientation): { width: number; height: number } {
  return orientation === "portrait"
    ? { width: A4.width, height: A4.height }
    : { width: A4.height, height: A4.width };
}

/** Area between the margins, the header and the footer. */
export function contentBox(orientation: Orientation = "portrait") {
  const page = pageSize(orientation);
  return {
    left: MARGIN,
    top: MARGIN + HEADER_HEIGHT,
    width: page.width - 2 * MARGIN,
    height: page.height - 2 * MARGIN - HEADER_HEIGHT - FOOTER_HEIGHT,
  };
}

/** Splits a list into pages of `size` items (the last one may be shorter). */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (size < 1) throw new Error("size must be at least 1");
  const pages: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    pages.push(items.slice(index, index + size));
  }
  return pages;
}

/** Columns and rows of a photo page: 2 → 1 × 2, 4 → 2 × 2, 6 → 2 × 3. */
export function photoGrid(perPage: 2 | 4 | 6): { columns: number; rows: number } {
  if (perPage === 2) return { columns: 1, rows: 2 };
  if (perPage === 4) return { columns: 2, rows: 2 };
  return { columns: 2, rows: 3 };
}

/** Space taken under each photo by its figure number and caption (two lines). */
export const CAPTION_HEIGHT = 30;
const GAP = 12;

/**
 * Size of the image box of one cell of a photo page, so that `perPage` photos with their
 * captions fill one page height (minus `reserved` for a section title) without overflowing.
 */
export function photoCellSize(perPage: 2 | 4 | 6, reserved = 0): { width: number; height: number } {
  const box = contentBox("portrait");
  const { columns, rows } = photoGrid(perPage);
  const width = (box.width - GAP * (columns - 1)) / columns;
  const rowHeight = (box.height - reserved - GAP * (rows - 1)) / rows;
  return { width, height: Math.max(40, rowHeight - CAPTION_HEIGHT) };
}

/**
 * Plan orientation: landscape when the image is wider than tall, as on the original drawing.
 */
export function planOrientation(width: number, height: number): Orientation {
  return width > height ? "landscape" : "portrait";
}

/**
 * Largest box with the image ratio that fits in `available` (centred horizontally), in points.
 */
export function fitImage(
  image: { width: number; height: number },
  available: { left: number; top: number; width: number; height: number },
): { left: number; top: number; width: number; height: number } {
  const scale = Math.min(available.width / image.width, available.height / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  return {
    left: available.left + (available.width - width) / 2,
    top: available.top,
    width,
    height,
  };
}

/**
 * Position of a marker drawing on the page: the point of the pin is at the relative
 * coordinates `(x, y)` of the image box; the drawing (`size` × `size`, point at the bottom
 * centre) is moved back inside the page when the marker sits on an edge (x = 0, x = 1, y = 0).
 */
export function markerBox(
  point: { x: number; y: number },
  image: { left: number; top: number; width: number; height: number },
  page: { width: number; height: number },
  size = PDF_MARKER_SIZE,
): { left: number; top: number; anchorX: number; anchorY: number } {
  const anchorX = image.left + clamp01(point.x) * image.width;
  const anchorY = image.top + clamp01(point.y) * image.height;
  const left = clamp(anchorX - size / 2, 0, page.width - size);
  const top = clamp(anchorY - size, 0, page.height - size);
  return { left, top, anchorX, anchorY };
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
