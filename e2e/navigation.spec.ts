import { expect, test } from "@playwright/test";

test.describe("Mes visites", () => {
  test("shows the title, the disabled action and the empty state", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Mes visites · RONDE/);
    await expect(page.getByRole("heading", { level: 1, name: "Mes visites" })).toBeVisible();
    const newVisit = page.getByRole("button", { name: "Nouvelle visite" });
    await expect(newVisit).toBeDisabled();
    await expect(newVisit).toHaveAccessibleDescription("Disponible à l'étape 5");
    await expect(page.getByRole("heading", { name: "Aucune visite pour l'instant" })).toBeVisible();
    await expect(
      page.getByText("Vos visites apparaîtront ici, sur la tablette comme sur l'ordinateur."),
    ).toBeVisible();
    await expect(page.locator('svg[data-mood="asleep"]')).toBeVisible();
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

    const visits = sideNav.getByRole("link", { name: "Mes visites" });
    await expect(visits).toHaveAttribute("aria-current", "page");

    await sideNav.getByRole("link", { name: "Mes réserves" }).click();
    await expect(page).toHaveURL(/\/reserves$/);
    await expect(page.getByRole("heading", { level: 1, name: "Mes réserves" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Aucune réserve à suivre" })).toBeVisible();
    await expect(sideNav.getByRole("link", { name: "Mes réserves" })).toHaveAttribute(
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

    await bottomNav.getByRole("link", { name: "Mes réserves" }).click();
    await expect(page).toHaveURL(/\/reserves$/);
    await expect(page.getByRole("heading", { level: 1, name: "Mes réserves" })).toBeVisible();
    await expect(bottomNav.getByRole("link", { name: "Mes réserves" })).toHaveAttribute(
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
    await expect(page.getByRole("heading", { level: 1, name: "Mes visites" })).toBeVisible();
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
