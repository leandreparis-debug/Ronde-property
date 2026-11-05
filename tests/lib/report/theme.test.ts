import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { FONT_FILES, REPORT_COLORS, reserveStatusColors } from "@/lib/report/theme";

const CSS = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");

function token(name: string): string | null {
  const match = new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`).exec(CSS);
  return match ? match[1]!.toLowerCase() : null;
}

describe("report theme", () => {
  it("takes every colour from a design token of globals.css", () => {
    for (const [name, value] of Object.entries(REPORT_COLORS)) {
      expect(token(name), `--color-${name}`).toBe(value);
    }
  });

  it("uses status colours only through reserveStatusColors", () => {
    expect(reserveStatusColors("open", false).text).toBe(REPORT_COLORS["status-open"]);
    expect(reserveStatusColors("done", true).text).toBe(REPORT_COLORS["status-open"]);
    expect(reserveStatusColors("in_progress", false).dot).toBe(
      REPORT_COLORS["status-progress-dot"],
    );
    expect(reserveStatusColors("done", false).background).toBe(REPORT_COLORS["status-done-bg"]);
  });

  it("ships every font file locally with its licence", () => {
    for (const font of FONT_FILES) {
      expect(
        readFileSync(path.join(process.cwd(), "public/fonts/report", font.file)).byteLength,
      ).toBeGreaterThan(10_000);
    }
    expect(
      readFileSync(
        path.join(process.cwd(), "public/fonts/report/OFL-BricolageGrotesque.txt"),
        "utf8",
      ),
    ).toContain("SIL Open Font License");
    expect(
      readFileSync(path.join(process.cwd(), "public/fonts/report/OFL-InstrumentSans.txt"), "utf8"),
    ).toContain("SIL Open Font License");
  });
});
