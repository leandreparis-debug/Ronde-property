import path from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

import { anonymousState, storageStatePath } from "./helpers/auth";

const BLOCKING = new Set(["serious", "critical"]);

async function expectNoBlockingViolation(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter((violation) => BLOCKING.has(violation.impact ?? ""));
  const summary = blocking.map(
    (violation) =>
      `${violation.impact} ${violation.id}: ${violation.help} (${violation.nodes.map((node) => node.target.join(" ")).join(", ")})`,
  );
  expect(summary, summary.join("\n")).toEqual([]);
}

test.describe("as rt", () => {
  for (const path of [
    "/",
    "/reserves",
    "/design",
    "/compte",
    "/changer-mot-de-passe",
    "/sites",
    "/sites/TEST-001",
    "/sites?q=lyon",
    "/?scope=all",
    "/visites/nouvelle",
    "/visites/20000000-0000-4000-8000-000000000001",
  ] as const) {
    test(`${path} has no serious or critical axe violation`, async ({ page }) => {
      await page.goto(path);
      await expectNoBlockingViolation(page);
    });
  }

  test("the Notes tab (editor, preview, zone management) has no serious or critical axe violation", async ({
    page,
  }) => {
    await page.goto("/visites/20000000-0000-4000-8000-000000000001?onglet=notes&zone=docks");
    await expect(page.getByTestId("zone-editor")).toBeVisible();
    await expectNoBlockingViolation(page);
    await page.getByRole("button", { name: "Aperçu du rapport" }).click();
    await expect(page.getByTestId("zone-preview")).toBeVisible();
    await expectNoBlockingViolation(page);
    await page.getByRole("button", { name: "Gérer les zones" }).click();
    await expect(page.getByTestId("manage-zones")).toBeVisible();
    await expectNoBlockingViolation(page);
  });

  test("/design at tablet width has no serious or critical axe violation", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/design");
    await expectNoBlockingViolation(page);
  });
});

test.describe("as direction", () => {
  test.use({ storageState: storageStatePath("claire") });

  test("the read-only visit page has no serious or critical axe violation", async ({ page }) => {
    await page.goto("/visites/20000000-0000-4000-8000-000000000001");
    await expect(page.getByTestId("visit-info-readonly")).toBeVisible();
    await expectNoBlockingViolation(page);
  });

  test("the read-only Notes tab has no serious or critical axe violation", async ({ page }) => {
    await page.goto("/visites/20000000-0000-4000-8000-000000000001?onglet=notes&zone=docks");
    await expect(page.getByTestId("zone-readonly")).toBeVisible();
    await expectNoBlockingViolation(page);
  });
});

test.describe("as visitor", () => {
  test.use({ storageState: anonymousState });

  test("/connexion has no serious or critical axe violation", async ({ page }) => {
    await page.goto("/connexion");
    await expectNoBlockingViolation(page);
  });
});

test.describe("as admin", () => {
  test.use({ storageState: storageStatePath("david") });

  for (const path of ["/admin/comptes", "/admin/journal", "/admin/sites/imports"] as const) {
    test(`${path} has no serious or critical axe violation`, async ({ page }) => {
      await page.goto(path);
      await expectNoBlockingViolation(page);
    });
  }

  test("the import page with a simulation report has no serious or critical axe violation", async ({
    page,
  }) => {
    await page.goto("/admin/sites/import");
    await expectNoBlockingViolation(page);
    await page.setInputFiles(
      "#import-file",
      path.join(__dirname, "..", "docs", "samples", "sites-vigie-exemple.csv"),
    );
    await page.getByRole("button", { name: "Simuler l'import" }).click();
    await expect(page.getByTestId("import-report")).toBeVisible();
    await expectNoBlockingViolation(page);
  });

  test("the account creation dialog has no serious or critical axe violation", async ({ page }) => {
    await page.goto("/admin/comptes");
    await page.getByRole("button", { name: "Nouveau compte" }).click();
    await expect(page.getByRole("dialog", { name: "Nouveau compte" })).toBeVisible();
    await expectNoBlockingViolation(page);
  });
});
