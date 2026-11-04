/**
 * Pure geometry of the plan viewer: the page image is drawn at `scale` (image pixels → screen
 * pixels) and translated by `(tx, ty)` inside the viewport. Markers are stored in relative
 * coordinates (0..1 of the page image), independent of the display resolution.
 */

export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Screen transform of the page image inside the viewport. */
export interface ViewTransform {
  scale: number;
  tx: number;
  ty: number;
}

/** The zoom never goes below the « fit » scale divided by this, nor above 8× the image pixels. */
export const MIN_ZOOM_FACTOR = 0.5;
export const MAX_SCALE = 8;
/** Zoom step of the « + » and « − » buttons. */
export const ZOOM_STEP = 1.5;

/** Transform that shows the whole page centred in the viewport, with a small margin. */
export function fitTransform(image: Size, viewport: Size, margin = 16): ViewTransform {
  const availableWidth = Math.max(1, viewport.width - margin * 2);
  const availableHeight = Math.max(1, viewport.height - margin * 2);
  const scale = Math.min(availableWidth / image.width, availableHeight / image.height);
  return {
    scale,
    tx: (viewport.width - image.width * scale) / 2,
    ty: (viewport.height - image.height * scale) / 2,
  };
}

/** Clamps a scale between half the fit scale and {@link MAX_SCALE}. */
export function clampScale(scale: number, fitScale: number): number {
  return Math.min(MAX_SCALE, Math.max(fitScale * MIN_ZOOM_FACTOR, scale));
}

/**
 * Zooms by `factor` around a screen point (the pinch centre, the cursor or the viewport
 * centre): the image point under `center` stays under `center`.
 */
export function zoomAt(
  transform: ViewTransform,
  factor: number,
  center: Point,
  fitScale: number,
): ViewTransform {
  const scale = clampScale(transform.scale * factor, fitScale);
  const ratio = scale / transform.scale;
  return {
    scale,
    tx: center.x - (center.x - transform.tx) * ratio,
    ty: center.y - (center.y - transform.ty) * ratio,
  };
}

/** Moves the image by a screen delta. */
export function panBy(transform: ViewTransform, dx: number, dy: number): ViewTransform {
  return { ...transform, tx: transform.tx + dx, ty: transform.ty + dy };
}

/**
 * Relative coordinates (0..1) of a screen point (relative to the viewport), or `null` when the
 * point falls outside the page image. The exact edges (0 and 1) are inside.
 */
export function screenToRelative(
  point: Point,
  transform: ViewTransform,
  image: Size,
): Point | null {
  const x = (point.x - transform.tx) / (image.width * transform.scale);
  const y = (point.y - transform.ty) / (image.height * transform.scale);
  const epsilon = 1e-9;
  if (x < -epsilon || x > 1 + epsilon || y < -epsilon || y > 1 + epsilon) return null;
  return { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
}

/** Screen position (relative to the viewport) of relative coordinates. */
export function relativeToScreen(point: Point, transform: ViewTransform, image: Size): Point {
  return {
    x: transform.tx + point.x * image.width * transform.scale,
    y: transform.ty + point.y * image.height * transform.scale,
  };
}

/** Transform that centres a relative point in the viewport, at least at `minScale`. */
export function centerOn(
  point: Point,
  transform: ViewTransform,
  image: Size,
  viewport: Size,
  minScale: number,
): ViewTransform {
  const scale = Math.max(transform.scale, minScale);
  return {
    scale,
    tx: viewport.width / 2 - point.x * image.width * scale,
    ty: viewport.height / 2 - point.y * image.height * scale,
  };
}

/** Distance between two points (pinch). */
export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Middle of two points (pinch centre). */
export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * True when a pointer sequence is a « tap »: one finger (or the mouse), short, without
 * travelling more than `slop` pixels, and never joined by a second pointer. Only a tap places
 * a marker: a pinch or a pan never does.
 */
export function isTap(
  sequence: { pointers: number; travel: number; durationMs: number },
  slop = 10,
  maxDurationMs = 600,
): boolean {
  return sequence.pointers === 1 && sequence.travel <= slop && sequence.durationMs <= maxDurationMs;
}
