/**
 * Theme of the PDF report: the design tokens of `src/app/globals.css` converted for
 * @react-pdf/renderer (which cannot read CSS variables). **Every colour comes from a token**:
 * a unit test compares each value with the token of the same name. White background for
 * printing; brand blue for titles and rules; status colours only for reserves.
 */

/** Colour tokens used by the report, keyed by their CSS name (`--color-{name}`). */
export const REPORT_COLORS = {
  brand: "#2f6aff",
  "brand-deep": "#1b45c9",
  "brand-soft": "#e7eeff",
  "brand-tint": "#f4f7ff",
  "on-brand": "#ffffff",
  ink: "#121317",
  "ink-2": "#5c606b",
  paper: "#ffffff",
  craie: "#f6f6f4",
  galet: "#e9e9e6",
  rule: "#e4e4e0",
  "status-open": "#c0341f",
  "status-open-bg": "#fde4de",
  "status-open-dot": "#d63a22",
  "status-progress": "#8f6200",
  "status-progress-bg": "#fff0c7",
  "status-progress-dot": "#e8a400",
  "status-done": "#23704a",
  "status-done-bg": "#dcf0e3",
} as const;
export type ReportColor = keyof typeof REPORT_COLORS;

/** Shorthand used by the PDF components. */
export const C = REPORT_COLORS;

/** Font families registered by `registerReportFonts`. */
export const FONTS = {
  display: "Bricolage Grotesque",
  text: "Instrument Sans",
} as const;

/** Font files (OFL, `public/fonts/report/`), limited to the weights the report uses. */
export const FONT_FILES = [
  {
    family: FONTS.display,
    file: "BricolageGrotesque-SemiBold.ttf",
    fontWeight: 600,
    fontStyle: "normal",
  },
  {
    family: FONTS.display,
    file: "BricolageGrotesque-Bold.ttf",
    fontWeight: 700,
    fontStyle: "normal",
  },
  { family: FONTS.text, file: "InstrumentSans-Regular.ttf", fontWeight: 400, fontStyle: "normal" },
  { family: FONTS.text, file: "InstrumentSans-SemiBold.ttf", fontWeight: 600, fontStyle: "normal" },
  { family: FONTS.text, file: "InstrumentSans-Italic.ttf", fontWeight: 400, fontStyle: "italic" },
] as const;

/** Type scale, in points. */
export const SIZES = {
  caption: 7.5,
  small: 8.5,
  body: 10,
  lead: 12,
  h3: 12.5,
  h2: 17,
  h1: 30,
} as const;

/** Colours of a reserve status (pill background, text, dot), « En retard » first. */
export function reserveStatusColors(status: "open" | "in_progress" | "done", isOverdue: boolean) {
  if (isOverdue || status === "open") {
    return { background: C["status-open-bg"], text: C["status-open"], dot: C["status-open-dot"] };
  }
  if (status === "in_progress") {
    return {
      background: C["status-progress-bg"],
      text: C["status-progress"],
      dot: C["status-progress-dot"],
    };
  }
  return { background: C["status-done-bg"], text: C["status-done"], dot: C["status-done"] };
}
