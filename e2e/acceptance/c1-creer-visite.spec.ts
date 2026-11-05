/**
 * Critère 1 (cahier des charges, § 14) :
 * « Un RT crée une visite sur un site choisi dans le référentiel de VIGIE. »
 */
import path from "node:path";

import { expect, test } from "@playwright/test";

import { storageStatePath } from "../helpers/auth";

const SAMPLE = path.join(__dirname, "..", "..", "docs", "samples", "sites-vigie-exemple.csv");

test.describe.configure({ mode: "serial" });

test.describe("C1 · créer une visite sur un site du référentiel VIGIE", () => {
  test("David importe le CSV VIGIE de test", async ({ browser }) => {
    const context = await browser.newContext({ storageState: storageStatePath("david") });
    const page = await context.newPage();
    await page.goto("/admin/sites/import");
    await page.setInputFiles("#import-file", SAMPLE);
    await page.getByRole("button", { name: "Simuler l'import" }).click();
    await expect(page.getByTestId("import-report")).toBeVisible();
    await page.getByRole("button", { name: "Appliquer l'import" }).click();
    await page
      .getByRole("dialog", { name: "Appliquer l'import ?" })
      .getByRole("button", { name: "Confirmer l'application" })
      .click();
    await expect(page.getByRole("heading", { name: "Import appliqué" })).toBeVisible();
    await context.close();
  });

  test("Alice trouve le site importé par son code puis par son nom sans accent, et crée la visite", async ({
    page,
  }) => {
    await page.goto("/visites/nouvelle");
    const picker = page.getByPlaceholder("Nom, code ou ville");
    await picker.fill("TEST-013");
    const options = page.getByRole("listbox", { name: "Sites proposés" }).getByRole("option");
    await expect(options.filter({ hasText: "Entrepôt fictif Nîmes" })).toBeVisible();

    // Same search by name, without the accent: « nimes » finds « Nîmes ».
    await picker.fill("nimes");
    const nimes = options.filter({ hasText: "TEST-013" });
    await expect(nimes).toBeVisible();
    await nimes.click();
    await expect(page.getByTestId("site-picker-selected")).toContainText("TEST-013");

    await page.fill("#title", "Visite C1 Nîmes");
    await page.getByRole("button", { name: "Créer la visite" }).click();
    await expect(page).toHaveURL(/\/visites\/[0-9a-f-]{36}/);
    await expect(page.getByRole("heading", { level: 1, name: "Visite C1 Nîmes" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: /TEST-013 · Entrepôt fictif Nîmes/ }),
    ).toBeVisible();

    // The visit is listed in « Mes visites » and on the site page.
    await page.goto("/");
    await expect(page.getByText("Visite C1 Nîmes")).toBeVisible();
    await page.goto("/sites/TEST-013");
    await expect(
      page.getByTestId("site-visit").filter({ hasText: "Visite C1 Nîmes" }),
    ).toBeVisible();
  });
});
