import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { BRAND_COLOR_TOKENS, BRAND_COLORS } from "@/lib/brand-colors";

const css = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");

describe("BRAND_COLORS", () => {
  it.each(Object.entries(BRAND_COLOR_TOKENS))("%s equals the token %s", (key, token) => {
    const match = new RegExp(`${token}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
    expect(match?.[1]?.toLowerCase()).toBe(BRAND_COLORS[key as keyof typeof BRAND_COLORS]);
  });
});
