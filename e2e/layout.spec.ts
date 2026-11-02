import { expect, test } from "@playwright/test";

const VIEWPORTS = [
  { name: "tablet portrait", width: 768, height: 1024 },
  { name: "tablet landscape", width: 1024, height: 768 },
  { name: "laptop", width: 1280, height: 800 },
  { name: "phone", width: 390, height: 844 },
] as const;

const PAGES = ["/", "/reserves", "/design"] as const;

const MIN_TARGET = 44;

for (const viewport of VIEWPORTS) {
  test.describe(`${viewport.name} (${viewport.width} × ${viewport.height})`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    for (const path of PAGES) {
      test(`${path} has no horizontal overflow`, async ({ page }) => {
        await page.goto(path);
        const widths = await page.evaluate(() => ({
          scroll: document.documentElement.scrollWidth,
          client: document.documentElement.clientWidth,
          body: document.body.scrollWidth,
        }));
        expect(widths.scroll).toBeLessThanOrEqual(widths.client);
        expect(widths.body).toBeLessThanOrEqual(widths.client);
      });
    }

    for (const path of ["/", "/design"] as const) {
      test(`${path} visible links and buttons are at least ${MIN_TARGET} px`, async ({ page }) => {
        await page.goto(path);
        const targets = page.locator("a, button, [role='tab']");
        const count = await targets.count();
        expect(count).toBeGreaterThan(0);
        const tooSmall: string[] = [];
        for (let index = 0; index < count; index += 1) {
          const target = targets.nth(index);
          if (!(await target.isVisible())) continue;
          const box = await target.boundingBox();
          if (!box) continue;
          if (box.width < MIN_TARGET || box.height < MIN_TARGET) {
            const text = (await target.innerText()).trim().slice(0, 40);
            tooSmall.push(
              `${text || "(sans texte)"}: ${Math.round(box.width)} × ${Math.round(box.height)}`,
            );
          }
        }
        expect(tooSmall, `Cibles trop petites : ${tooSmall.join(", ")}`).toEqual([]);
      });
    }
  });
}
