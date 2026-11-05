import { expect, type Page } from "@playwright/test";

import { test } from "./helpers/csp";

import { anonymousState, storageStatePath } from "./helpers/auth";

const VIEWPORTS = [
  { name: "tablet portrait", width: 768, height: 1024 },
  { name: "tablet landscape", width: 1024, height: 768 },
  { name: "laptop", width: 1280, height: 800 },
  { name: "phone", width: 390, height: 844 },
] as const;

const MIN_TARGET = 44;

async function expectNoHorizontalOverflow(page: Page) {
  const widths = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
    body: document.body.scrollWidth,
  }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.client);
  expect(widths.body).toBeLessThanOrEqual(widths.client);
}

async function expectTouchTargets(page: Page) {
  const targets = page.locator("a, button, [role='tab'], [role='switch']");
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
}

for (const viewport of VIEWPORTS) {
  test.describe(`${viewport.name} (${viewport.width} × ${viewport.height}) as rt`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    for (const path of [
      "/",
      "/reserves",
      "/design",
      "/compte",
      "/changer-mot-de-passe",
      "/sites",
      "/sites/TEST-001",
      "/?scope=all",
      "/visites/nouvelle",
      "/visites/20000000-0000-4000-8000-000000000001",
      "/visites/20000000-0000-4000-8000-000000000001?onglet=notes&zone=docks",
      "/visites/20000000-0000-4000-8000-000000000001?onglet=photos",
    ] as const) {
      test(`${path} has no horizontal overflow`, async ({ page }) => {
        await page.goto(path);
        await expectNoHorizontalOverflow(page);
      });
    }

    for (const path of [
      "/",
      "/design",
      "/compte",
      "/sites",
      "/sites/TEST-001",
      "/visites/nouvelle",
      "/visites/20000000-0000-4000-8000-000000000001",
      "/visites/20000000-0000-4000-8000-000000000001?onglet=notes&zone=docks",
      "/visites/20000000-0000-4000-8000-000000000001?onglet=photos",
    ] as const) {
      test(`${path} visible links and buttons are at least ${MIN_TARGET} px`, async ({ page }) => {
        await page.goto(path);
        await expectTouchTargets(page);
      });
    }
  });
}

for (const viewport of VIEWPORTS.filter((v) => v.width === 768 || v.width === 1280)) {
  test.describe(`${viewport.name} (${viewport.width} × ${viewport.height}) as admin`, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      storageState: storageStatePath("david"),
    });

    for (const path of [
      "/admin/comptes",
      "/admin/journal",
      "/admin/sites/import",
      "/admin/sites/imports",
    ] as const) {
      test(`${path} has no horizontal overflow and ${MIN_TARGET} px targets`, async ({ page }) => {
        await page.goto(path);
        await expectNoHorizontalOverflow(page);
        await expectTouchTargets(page);
      });
    }
  });

  test.describe(`${viewport.name} (${viewport.width} × ${viewport.height}) as visitor`, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      storageState: anonymousState,
    });

    test("/connexion has no horizontal overflow and 44 px targets", async ({ page }) => {
      await page.goto("/connexion");
      await expectNoHorizontalOverflow(page);
      await expectTouchTargets(page);
    });
  });
}
