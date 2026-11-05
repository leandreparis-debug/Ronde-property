/**
 * Token colours needed outside CSS (web app manifest, `theme-color`, generated icons). The
 * values are those of `src/app/globals.css`; a unit test fails as soon as they drift apart.
 */
export const BRAND_COLORS = {
  /** `--color-brand`: the mascot. */
  brand: "#2f6aff",
  /** `--color-craie`: application background (theme and splash background). */
  craie: "#f6f6f4",
  /** `--color-paper`: icon tile. */
  paper: "#ffffff",
  /** `--color-on-brand`: eyes of the mascot. */
  onBrand: "#ffffff",
} as const;

/** CSS custom property each colour of {@link BRAND_COLORS} comes from. */
export const BRAND_COLOR_TOKENS: Record<keyof typeof BRAND_COLORS, string> = {
  brand: "--color-brand",
  craie: "--color-craie",
  paper: "--color-paper",
  onBrand: "--color-on-brand",
};
