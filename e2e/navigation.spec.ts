import { expect, test } from "@playwright/test";

test.describe("Visites", () => {
  test("shows the title, the creation action and the seeded visit", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Visites · RONDE/);
    await expect(page.getByRole("heading", { level: 1, name: "Visites" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Nouvelle visite" })).toBeVisible();
    await expect(page.locator("[data-testid^=visit-]").first()).toBeVisible();
  });

  test("sets the document language to French", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  });
});

test.describe("navigation with the side bar (1280 px)", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("goes to « Mes réserves » and marks the current link", async ({ page }) => {
    await page.goto("/");
    const sideNav = page.getByRole("complementary", { name: "Navigation principale" });
    await expect(sideNav).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Navigation principale" })).toBeHidden();

    const visits = sideNav.getByRole("link", { name: "Visites", exact: true });
    await expect(visits).toHaveAttribute("aria-current", "page");

    await sideNav.getByRole("link", { name: "Réserves" }).click();
    await expect(page).toHaveURL(/\/reserves$/);
    await expect(page.getByRole("heading", { level: 1, name: "Réserves" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Aucune réserve à suivre" })).toBeVisible();
    await expect(sideNav.getByRole("link", { name: "Réserves" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(visits).not.toHaveAttribute("aria-current", "page");
  });
});

test.describe("navigation with the bottom bar (768 px)", () => {
  test.use({ viewport: { width: 768, height: 1024 } });

  test("goes to « Mes réserves » from the bottom bar", async ({ page }) => {
    await page.goto("/");
    const bottomNav = page.getByRole("navigation", { name: "Navigation principale" });
    await expect(bottomNav).toBeVisible();
    await expect(page.getByRole("complementary", { name: "Navigation principale" })).toBeHidden();

    const box = await bottomNav.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(56);
    expect(box!.y + box!.height).toBeCloseTo(1024, 0);

    await bottomNav.getByRole("link", { name: "Réserves" }).click();
    await expect(page).toHaveURL(/\/reserves$/);
    await expect(page.getByRole("heading", { level: 1, name: "Réserves" })).toBeVisible();
    await expect(bottomNav.getByRole("link", { name: "Réserves" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});

test.describe("unknown route", () => {
  test("shows the custom 404 with a link back to « Mes visites »", async ({ page }) => {
    const response = await page.goto("/cette-page-n-existe-pas");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Cette page n'existe pas" })).toBeVisible();
    await expect(page.locator('svg[data-mood="worried"]')).toBeVisible();
    await page.getByRole("link", { name: "Mes visites" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1, name: "Visites" })).toBeVisible();
  });
});

test.describe("security headers", () => {
  test("are sent on every page", async ({ request }) => {
    const response = await request.get("/");
    const headers = response.headers();
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["permissions-policy"]).toBe("camera=(self), microphone=(), geolocation=()");
    expect(headers["x-powered-by"]).toBeUndefined();
  });
});
