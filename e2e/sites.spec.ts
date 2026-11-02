import path from "node:path";

import { expect, test } from "@playwright/test";

import { storageStatePath } from "./helpers/auth";

const SAMPLE = path.join(__dirname, "..", "docs", "samples", "sites-vigie-exemple.csv");

// The import changes the repository that the searches below rely on: run in order.
test.describe.configure({ mode: "serial" });

test.describe("site import (admin)", () => {
  test.use({ storageState: storageStatePath("david") });

  test("David simulates the sample, sees the guard with the full referential option, then applies", async ({
    page,
  }) => {
    await page.goto("/admin/sites/import");
    await page.setInputFiles("#import-file", SAMPLE);
    await page.getByRole("button", { name: "Simuler l'import" }).click();
    const report = page.getByTestId("import-report");
    await expect(report).toBeVisible();
    await expect(page.getByTestId("counter-Créations")).toHaveText("6");
    await expect(page.getByTestId("counter-Mises à jour")).toHaveText("1");
    await expect(page.getByTestId("counter-Inchangés")).toHaveText("2");
    await expect(page.getByTestId("counter-Réactivations")).toHaveText("1");
    await expect(page.getByTestId("counter-Désactivations")).toHaveText("0");
    await expect(page.getByTestId("counter-Rejets")).toHaveText("5");
    await expect(page.getByTestId("reject-row")).toHaveCount(5);
    await expect(report.getByText("Code en double dans le fichier").first()).toBeVisible();
    await expect(report.getByText("Windows-1252 (Excel)")).toBeVisible();
    await expect(report.getByText("Colonnes ignorées :")).toBeVisible();

    // Full referential: 8 of 11 active sites would be deactivated → guard.
    await page.getByText("Ce fichier contient tout le référentiel").click();
    await page.getByRole("button", { name: "Simuler l'import" }).click();
    await expect(page.getByTestId("mass-deactivation-guard")).toBeVisible();
    await expect(page.getByTestId("counter-Désactivations")).toHaveText("8");
    await expect(page.getByRole("button", { name: "Appliquer l'import" })).toBeDisabled();

    // Back to a partial file, then apply.
    await page.getByText("Ce fichier contient tout le référentiel").click();
    await page.getByRole("button", { name: "Simuler l'import" }).click();
    await expect(page.getByTestId("counter-Désactivations")).toHaveText("0");
    await page.getByRole("button", { name: "Appliquer l'import" }).click();
    const dialog = page.getByRole("dialog", { name: "Appliquer l'import ?" });
    await expect(dialog).toContainText("6 créés, 1 mis à jour, 1 réactivé");
    await dialog.getByRole("button", { name: "Confirmer l'application" }).click();
    await expect(page.getByText("Référentiel mis à jour").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Import appliqué" })).toBeVisible();

    await page.goto("/admin/sites/imports");
    const runs = page.locator("[data-testid=import-run]");
    await expect(runs.first()).toHaveAttribute("data-mode", "apply");
    await expect(runs.first()).toContainText("sites-vigie-exemple.csv");
    await expect(runs.first()).toContainText("5 rejetés");
  });

  test("a second simulation of the same file leaves everything unchanged", async ({ page }) => {
    await page.goto("/admin/sites/import");
    await page.setInputFiles("#import-file", SAMPLE);
    await page.getByRole("button", { name: "Simuler l'import" }).click();
    await expect(page.getByTestId("counter-Inchangés")).toHaveText("10");
    await expect(page.getByTestId("counter-Créations")).toHaveText("0");
  });

  test("refuses a file without the required columns", async ({ page }) => {
    await page.goto("/admin/sites/import");
    await page.setInputFiles("#import-file", {
      name: "sans-nom.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("Code;Ville\nA;Lyon\n"),
    });
    await page.getByRole("button", { name: "Simuler l'import" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Colonnes obligatoires absentes" }),
    ).toBeVisible();
    await expect(page.getByTestId("import-report")).toHaveCount(0);
  });
});

for (const [role, width] of [
  ["alice", 1280],
  ["claire", 768],
] as const) {
  test.describe(`site search as ${role}`, () => {
    test.use({
      storageState: storageStatePath(role),
      viewport: { width, height: width === 1280 ? 800 : 1024 },
    });

    test("finds « Nîmes » with « nimes » and opens its page", async ({ page }) => {
      await page.goto("/sites");
      await page.getByLabel("Rechercher un site").fill("nimes");
      await expect(page).toHaveURL(/q=nimes/);
      const card = page.getByTestId("site-TEST-013");
      await expect(card).toBeVisible();
      await expect(page.getByText("Page 1 sur 1 · 1 site")).toBeVisible();
      await card.click();
      await expect(page).toHaveURL(/\/sites\/TEST-013$/);
      await expect(
        page.getByRole("heading", { level: 1, name: "Entrepôt fictif Nîmes" }),
      ).toBeVisible();
      await expect(page.getByText("30000 Nîmes")).toBeVisible();
      await expect(page.getByText("Source : référentiel VIGIE")).toBeVisible();
    });

    test("shows an empty state for an unknown query", async ({ page }) => {
      await page.goto("/sites?q=zzzz-introuvable");
      await expect(
        page.getByRole("heading", { name: "Aucun site ne correspond à « zzzz-introuvable »" }),
      ).toBeVisible();
      await expect(page.locator('svg[data-mood="asleep"]')).toBeVisible();
    });
  });
}

test.describe("site page", () => {
  test("TEST-001 lists the seed visit with its reserves", async ({ page }) => {
    await page.goto("/sites/TEST-001");
    await expect(
      page.getByRole("heading", { level: 1, name: "Entrepôt fictif Lyon Sud" }),
    ).toBeVisible();
    const seeded = page.getByTestId("site-visit").filter({ hasText: "Visite périodique Lyon Sud" });
    await expect(seeded).toHaveCount(1);
    await expect(seeded).toContainText("4 réserves ouvertes dont 1 en retard");
    await expect(seeded).toContainText("En cours");
    await expect(seeded.getByRole("link")).toHaveAttribute(
      "href",
      /\/visites\/20000000-0000-4000-8000-000000000001$/,
    );
  });

  test("an unknown code renders the RONDE 404", async ({ page }) => {
    const response = await page.goto("/sites/INCONNU-999");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Cette page n'existe pas" })).toBeVisible();
  });

  test("Alice gets the 403 on the import pages", async ({ page }) => {
    for (const path of ["/admin/sites/import", "/admin/sites/imports"]) {
      const response = await page.goto(path);
      expect(response?.status()).toBe(403);
    }
  });

  test("includes inactive sites only on demand", async ({ page }) => {
    await page.goto("/sites?q=reims");
    await expect(page.getByTestId("site-TEST-021")).toHaveCount(0);
    await page.getByLabel("Inclure les sites inactifs").check();
    await expect(page).toHaveURL(/inactive=1/);
    await expect(page.getByTestId("site-TEST-021")).toBeVisible();
    await expect(page.getByTestId("site-TEST-021")).toContainText("Inactif");
  });
});
