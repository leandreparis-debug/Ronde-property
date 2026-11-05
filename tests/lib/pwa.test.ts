import { existsSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import manifest from "@/app/manifest";
import { BRAND_COLORS } from "@/lib/brand-colors";
import { startupImages } from "@/lib/pwa";

const publicFile = (url: string) => path.join(process.cwd(), "public", url);

describe("web app manifest", () => {
  const value = manifest();

  it("describes an installable French standalone application", () => {
    expect(value).toMatchObject({
      name: "RONDE",
      lang: "fr",
      start_url: "/",
      display: "standalone",
      orientation: "any",
      theme_color: BRAND_COLORS.craie,
      background_color: BRAND_COLORS.craie,
    });
  });

  it("lists 192 and 512 icons and a maskable one, all generated", () => {
    const icons = value.icons ?? [];
    expect(icons.map((icon) => `${icon.sizes} ${icon.purpose}`)).toEqual([
      "192x192 any",
      "512x512 any",
      "512x512 maskable",
    ]);
    for (const icon of icons) expect(existsSync(publicFile(icon.src))).toBe(true);
  });
});

describe("iOS splash screens", () => {
  it("exist for each iPad, portrait and landscape", () => {
    const images = startupImages();
    expect(images).toHaveLength(10);
    for (const image of images) expect(existsSync(publicFile(image.url))).toBe(true);
    expect(images[0]?.media).toContain("orientation: portrait");
  });
});
