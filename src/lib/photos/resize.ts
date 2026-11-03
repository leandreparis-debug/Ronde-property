/** Pure geometry of the resize step, unit-tested without a canvas. */

export interface Dimensions {
  width: number;
  height: number;
}

/**
 * Dimensions that fit `source` within `maxSide` on its longest side, keeping the ratio and
 * never upscaling. Each side is at least 1 px.
 */
export function targetDimensions(source: Dimensions, maxSide: number): Dimensions {
  const { width, height } = source;
  if (width <= 0 || height <= 0) return { width: 1, height: 1 };
  const longest = Math.max(width, height);
  if (longest <= maxSide) return { width: Math.round(width), height: Math.round(height) };
  const scale = maxSide / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** True when an EXIF orientation swaps the width and the height (5 to 8). */
export function orientationSwapsSides(orientation: number | undefined): boolean {
  return orientation !== undefined && orientation >= 5 && orientation <= 8;
}
