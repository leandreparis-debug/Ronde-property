import { readFile } from "node:fs/promises";

import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

import { storageStatePath } from "./helpers/auth";
import { test } from "./helpers/csp";

/* Pilot (step 11, point 6): account menu, « Donner mon avis », /admin/avis, /aide, errors. */

async function expectNoBlockingViolation(page: Page) {
  await page.waitForFunction(() =>
    document.getAnimations().every((animation) => animation.playState !== "running"),
  );
  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter((v) =>
    ["serious", "critical"].includes(v.impact ?? ""),
  );
  expect(
    blocking.map((v) => `${v.impact} ${v.id}: ${v.help}`),
    blocking.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`).join("\n"),
  ).toEqual([]);
}

async function expectNoHorizontalOverflow(page: Page) {
  const widths = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.client);
}

async function openAccountMenu(page: Page) {
  await page.getByTestId("account-menu-trigger").filter({ visible: true }).click();
  const menu = page.getByTestId("account-menu").filter({ visible: true });
  await expect(menu).toBeVisible();
  return menu;
}

const STAMP = `Avis e2e ${Date.now()}`;

// The admin tests read the feedback given by the RT test.
test.describe.configure({ mode: "serial" });

test.describe("RT on a tablet", () => {
  test.use({ storageState: storageStatePath("bruno"), viewport: { width: 768, height: 1024 } });

  test("the account menu shows the version, the help link, and closes with Escape", async ({
    page,
  }) => {
    await page.goto("/");
    const menu = await openAccountMenu(page);
    await expect(menu.getByTestId("app-version")).toHaveText(/^Version \d+\.\d+\.\d+$/);
    await expect(menu.getByRole("link", { name: "Aide" })).toHaveAttribute("href", "/aide");
    await expectNoBlockingViolation(page);
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
  });

  test("gives a feedback with only the rating, the page being filled in", async ({ page }) => {
    await page.goto("/visites/20000000-0000-4000-8000-000000000002?onglet=notes");
    const menu = await openAccountMenu(page);
    await menu.getByRole("button", { name: "Donner mon avis" }).click();
    const dialog = page.getByTestId("feedback-dialog").filter({ visible: true });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("/visites/20000000-0000-4000-8000-000000000002");
    const submit = dialog.getByTestId("feedback-submit");
    await expect(submit).toBeDisabled();
    await dialog.getByText("Difficile", { exact: true }).click();
    await dialog.getByLabel("Ce qui bloque").fill(STAMP);
    await expectNoBlockingViolation(page);
    await submit.click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("Merci pour votre avis").first()).toBeVisible();
  });

  test("reads the RT guide on /aide, never the admin guide", async ({ page }) => {
    await page.goto("/aide");
    await expect(page.getByTestId("guide-admin")).toHaveCount(0);
    await expect(page.getByTestId("help-version")).toHaveText(/RONDE version \d+\.\d+\.\d+/);
    await page.getByTestId("guide-rt").click();
    const guide = page.getByTestId("guide");
    await expect(guide.getByRole("heading", { level: 1, name: "Guide des RT" })).toBeVisible();
    await expect(guide.getByRole("heading", { level: 2, name: "Que faire si…" })).toBeVisible();
    const images = guide.locator("img");
    expect(await images.count()).toBeGreaterThan(5);
    for (const image of await images.all()) {
      await image.scrollIntoViewIfNeeded();
      await expect(image).toHaveJSProperty("complete", true);
      expect(await image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    }
    await expectNoBlockingViolation(page);
    await expectNoHorizontalOverflow(page);
    const forbidden = await page.goto("/aide/admin");
    expect(forbidden?.status()).toBe(403);
  });
});

test.describe("admin on a PC", () => {
  test.use({ storageState: storageStatePath("david"), viewport: { width: 1280, height: 800 } });

  test("lists the feedback with filters and exports them as CSV", async ({ page }) => {
    await page.goto("/admin/avis");
    const item = page.getByTestId("feedback-item").filter({ hasText: STAMP });
    await expect(item).toBeVisible();
    await expect(item).toContainText("Note 2/5");
    await expect(item).toContainText("Bruno Fictif");
    await expect(item).not.toContainText("@");
    await expectNoBlockingViolation(page);
    await expectNoHorizontalOverflow(page);

    await page.getByLabel("Note", { exact: true }).selectOption("1");
    await page.getByRole("button", { name: "Filtrer" }).click();
    await expect(page).toHaveURL(/note=1/);
    await expect(page.getByTestId("feedback-item").filter({ hasText: STAMP })).toHaveCount(0);

    await page.goto("/admin/avis?note=2&bloque=1");
    const download = page.waitForEvent("download");
    await page.getByTestId("feedback-export").click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^ronde-avis-\d{4}-\d{2}-\d{2}\.csv$/);
    const csv = await readFile(await file.path(), "utf8");
    expect(csv.startsWith('﻿"Date";"Auteur"')).toBe(true);
    expect(csv).toContain(`"${STAMP}"`);
    expect(csv).not.toMatch(/@example\.test/);
  });

  test("lays /admin/avis and /aide out on a tablet without horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    for (const url of ["/admin/avis", "/aide", "/aide/admin"]) {
      await page.goto(url);
      await expectNoHorizontalOverflow(page);
    }
    await expectNoBlockingViolation(page);
  });
});

test.describe("error pages", () => {
  test.use({ storageState: storageStatePath("alice") });

  test("not-found shows the worried Galet with a 404", async ({ page }) => {
    const response = await page.goto("/cette-page-n-existe-pas");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Cette page n'existe pas" })).toBeVisible();
    await expect(page.locator("[data-mood=worried]")).toBeVisible();
    await expectNoBlockingViolation(page);
  });
});
