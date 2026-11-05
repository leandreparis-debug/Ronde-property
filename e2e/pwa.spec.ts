import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import sharp from "sharp";

import { createVisit } from "./acceptance/helpers";
import { storageStatePath } from "./helpers/auth";

/*
 * Installable application (step 11, point 2): manifest, icons, iOS metadata, installability as
 * reported by Chromium, offline banner and `/hors-ligne`. No service worker at this step.
 */

async function expectNoBlockingViolation(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter((v) =>
    ["serious", "critical"].includes(v.impact ?? ""),
  );
  expect(blocking.map((v) => `${v.impact} ${v.id}: ${v.help}`)).toEqual([]);
}

test.describe("installable application", () => {
  test.use({ storageState: storageStatePath("alice") });

  test("serves the manifest and its icons at their declared sizes", async ({ request }) => {
    const response = await request.get("/manifest.webmanifest");
    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toContain("application/manifest+json");
    const manifest = (await response.json()) as {
      name: string;
      lang: string;
      display: string;
      start_url: string;
      orientation: string;
      icons: { src: string; sizes: string; purpose: string }[];
    };
    expect(manifest).toMatchObject({
      name: "RONDE",
      lang: "fr",
      display: "standalone",
      start_url: "/",
      orientation: "any",
    });
    for (const icon of manifest.icons) {
      const file = await request.get(icon.src);
      expect(file.headers()["content-type"]).toBe("image/png");
      const { width, height } = await sharp(await file.body()).metadata();
      expect(`${width}x${height}`).toBe(icon.sizes);
    }
    const apple = await request.get("/apple-icon.png");
    expect((await sharp(await apple.body()).metadata()).width).toBe(180);
    expect((await request.get("/favicon.ico")).ok()).toBe(true);
  });

  test("links the manifest, the iOS icon and splash screens, and is installable for Chromium", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator("link[rel=manifest]")).toHaveAttribute(
      "href",
      "/manifest.webmanifest",
    );
    await expect(page.locator("link[rel=apple-touch-icon]")).toHaveCount(1);
    expect(await page.locator("link[rel=apple-touch-startup-image]").count()).toBe(10);
    await expect(page.locator("meta[name=theme-color]")).toHaveAttribute("content", "#f6f6f4");
    await expect(page.locator("meta[name=mobile-web-app-capable]")).toHaveAttribute(
      "content",
      "yes",
    );

    const cdp = await page.context().newCDPSession(page);
    const { installabilityErrors } = await cdp.send("Page.getInstallabilityErrors");
    expect(installabilityErrors.map((error) => error.errorId)).toEqual([]);
    const manifest = await cdp.send("Page.getAppManifest");
    expect(manifest.errors).toEqual([]);
  });

  test("shows the offline banner, then « Connexion rétablie »", async ({ page, context }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await context.setOffline(true);
    const banner = page.getByTestId("offline-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("Vos notes restent sur cette page");
    await expectNoBlockingViolation(page);
    await context.setOffline(false);
    await expect(banner).toHaveCount(0);
    await expect(page.getByTestId("online-banner")).toContainText("Connexion rétablie");
  });

  test("keeps the input of the information and of a reserve when the network is down", async ({
    page,
    context,
  }) => {
    const visit = await createVisit(page, "TEST-011", "Visite e2e hors connexion");
    await page.goto(visit);
    await context.setOffline(true);
    await page.fill("#visit-subject", "Objet saisi hors connexion");
    await page.locator("#visit-subject").blur();
    await expect(page.getByTestId("save-status")).toContainText("Hors connexion");
    await expect(page.locator("#visit-subject")).toHaveValue("Objet saisi hors connexion");
    await context.setOffline(false);
    await page.fill("#visit-subject", "Objet saisi hors connexion, renvoyé");
    await page.locator("#visit-subject").blur();
    await expect(page.getByTestId("save-status")).toContainText("Enregistré à");

    await page.goto(`${visit}?onglet=reserves`);
    await expect(page.getByTestId("reserves-counters")).toBeVisible();
    await page.getByTestId("reserve-new").click();
    await page.getByTestId("reserve-action").fill("Réserve saisie hors connexion");
    await context.setOffline(true);
    await page.getByTestId("reserve-save").click();
    const sheet = page.getByTestId("reserve-sheet");
    await expect(sheet).toContainText("Hors connexion");
    await expect(page.getByTestId("reserve-action")).toHaveValue("Réserve saisie hors connexion");
    await context.setOffline(false);
    await page.getByTestId("reserve-save").click();
    await expect(sheet).toHaveCount(0);
    await expect(
      page.getByTestId("reserve-card").filter({ hasText: "Réserve saisie hors connexion" }),
    ).toBeVisible();
  });
});

test.describe("/hors-ligne", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("is public and explains the behaviour of the queues", async ({ page }) => {
    await page.goto("/hors-ligne");
    await expect(page).toHaveURL(/\/hors-ligne$/);
    await expect(page.getByRole("heading", { level: 1, name: "Hors connexion" })).toBeVisible();
    await expect(page.getByText("puis toutes les 30 s")).toBeVisible();
    await expectNoBlockingViolation(page);
  });
});
