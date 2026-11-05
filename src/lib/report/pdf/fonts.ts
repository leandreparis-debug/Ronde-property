import { Font } from "@react-pdf/renderer";

import { FONT_FILES } from "../theme";

let registeredWith: string | null = null;

/**
 * Registers the report fonts (local OFL TTF files, never a CDN) and disables hyphenation: no
 * French word is ever cut. `resolve` maps a file name to its URL (browser: `/fonts/report/…`)
 * or absolute path (Node tests). Idempotent for the same resolver base.
 */
export function registerReportFonts(resolve: (file: string) => string): void {
  const base = resolve("");
  if (registeredWith === base) return;
  const families = new Map<
    string,
    Array<{ src: string; fontWeight: number; fontStyle: "normal" | "italic" }>
  >();
  for (const font of FONT_FILES) {
    const list = families.get(font.family) ?? [];
    list.push({ src: resolve(font.file), fontWeight: font.fontWeight, fontStyle: font.fontStyle });
    families.set(font.family, list);
  }
  for (const [family, fonts] of families) Font.register({ family, fonts });
  Font.registerHyphenationCallback((word) => [word]);
  registeredWith = base;
}
