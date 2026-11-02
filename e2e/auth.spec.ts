import { expect, test } from "@playwright/test";

import {
  anonymousState,
  loginAs,
  SEED_PASSWORD,
  SEED_USERS,
  storageStatePath,
} from "./helpers/auth";

test.describe("sign-in", () => {
  test.use({ storageState: anonymousState });

  test("redirects a visitor to /connexion with next, and back after sign-in", async ({ page }) => {
    await page.goto("/reserves");
    await expect(page).toHaveURL(/\/connexion\?next=%2Freserves$/);
    await expect(page.getByRole("heading", { name: "Connexion" })).toBeVisible();
    await loginAs(page, "alice", SEED_PASSWORD, "/reserves");
    await expect(page).toHaveURL(/\/reserves$/);
    await expect(page.getByRole("heading", { level: 1, name: "Mes réserves" })).toBeVisible();
  });

  for (const role of ["alice", "claire", "david"] as const) {
    test(`${role} signs in and sees their name`, async ({ page }) => {
      await loginAs(page, role);
      await expect(page).toHaveURL(/\/$/);
      await expect(page.getByText(SEED_USERS[role].name).first()).toBeVisible();
    });
  }

  test("shows the same generic message for a wrong password, an unknown email and an inactive account", async ({
    page,
  }) => {
    const attempts = [
      [SEED_USERS.alice.email, "mauvais-mot-de-passe-1"],
      ["inconnu@example.test", SEED_PASSWORD],
      [SEED_USERS.inactif.email, SEED_PASSWORD],
    ];
    for (const [email, password] of attempts) {
      await page.goto("/connexion");
      await page.getByLabel("Email").fill(email!);
      await page.getByLabel("Mot de passe", { exact: true }).fill(password!);
      await page.getByRole("button", { name: "Se connecter" }).click();
      await expect(page.locator("form").getByRole("alert")).toHaveText(
        "Email ou mot de passe incorrect.",
      );
      await expect(page).toHaveURL(/\/connexion/);
    }
  });

  test("ignores an external next and lands on the home page", async ({ page }) => {
    for (const next of ["https://exemple.com", "//exemple.com"]) {
      await page.context().clearCookies();
      await loginAs(page, "alice", SEED_PASSWORD, next);
      await expect(page).toHaveURL(/\/$/);
    }
  });

  test("sends a tampered session cookie back to /connexion", async ({ page, context }) => {
    await context.addCookies([
      {
        name: "ronde_local_session",
        value: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.falsifie",
        domain: "127.0.0.1",
        path: "/",
      },
    ]);
    await page.goto("/");
    await expect(page).toHaveURL(/\/connexion$/);
  });

  test("keeps /design public", async ({ page }) => {
    await page.goto("/design");
    await expect(page.getByRole("heading", { name: "Design system" })).toBeVisible();
  });
});

test.describe("direction", () => {
  test.use({ storageState: storageStatePath("claire") });

  test("sees « Lecture seule » and has no Administration entry", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await expect(page.getByText("Lecture seule").first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Administration" })).toHaveCount(0);
    await page.setViewportSize({ width: 768, height: 1024 });
    await expect(page.locator("header").getByText("Lecture seule")).toBeVisible();
  });

  test("gets the 403 page on /admin/journal", async ({ page }) => {
    const response = await page.goto("/admin/journal");
    expect(response?.status()).toBe(403);
    await expect(
      page.getByRole("heading", { name: "Vous n'avez pas accès à cette page" }),
    ).toBeVisible();
  });
});

test.describe("rt", () => {
  test("Alice gets the 403 page on /admin/comptes", async ({ page }) => {
    const response = await page.goto("/admin/comptes");
    expect(response?.status()).toBe(403);
    await expect(page.locator('svg[data-mood="worried"]')).toBeVisible();
    await page.getByRole("link", { name: "Retour à l'accueil" }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("signs out from the account page", async ({ page }) => {
    await page.goto("/compte");
    await expect(
      page.getByRole("heading", { level: 1, name: SEED_USERS.alice.name }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Se déconnecter" }).click();
    await expect(page).toHaveURL(/\/connexion$/);
    await page.goto("/compte");
    await expect(page).toHaveURL(/\/connexion\?next=%2Fcompte$/);
  });

  test("can rename themselves on /compte", async ({ page }) => {
    await page.goto("/compte");
    await page.getByLabel("Nom affiché").fill("Alice Fictive");
    await page.getByRole("button", { name: "Enregistrer le nom" }).click();
    await expect(page.getByText("Nom enregistré", { exact: true })).toBeVisible();
  });
});
