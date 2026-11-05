import { expect, test } from "@playwright/test";

import { storageStatePath } from "./helpers/auth";

test.use({ storageState: storageStatePath("alice") });

// next/font/local: neither the build nor the browser contacts Google Fonts (step 11).
test("loads the interface fonts locally, never from Google Fonts", async ({ page }) => {
  const external: string[] = [];
  page.on("request", (request) => {
    if (/fonts\.(googleapis|gstatic)\.com/.test(request.url())) external.push(request.url());
  });
  for (const url of ["/design", "/", "/visites/20000000-0000-4000-8000-000000000001"]) {
    await page.goto(url);
    await page.evaluate(() => document.fonts.ready);
  }
  const loaded = await page.evaluate(() =>
    [...document.fonts].filter((font) => font.status === "loaded").map((font) => font.weight),
  );
  expect(loaded.length).toBeGreaterThanOrEqual(2);
  expect(external).toEqual([]);
  const css = await page.evaluate(() =>
    [...document.styleSheets]
      .flatMap((sheet) => {
        try {
          return [...sheet.cssRules].map((rule) => rule.cssText);
        } catch {
          return [];
        }
      })
      .filter((text) => text.startsWith("@font-face"))
      .join("\n"),
  );
  expect(css).toContain(".woff2");
  expect(css).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
});
