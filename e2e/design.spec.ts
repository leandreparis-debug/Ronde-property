import { expect } from "@playwright/test";

import { test } from "./helpers/csp";

const MOODS = ["neutral", "attentive", "worried", "happy", "asleep"] as const;

test.describe("/design", () => {
  test("is flagged as fictitious data and not indexed", async ({ page }) => {
    await page.goto("/design");
    await expect(page.getByText("Données fictives").first()).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });

  test("shows the five Galet moods with their usage", async ({ page }) => {
    await page.goto("/design");
    const moods = page.getByTestId("galet-moods");
    for (const mood of MOODS) {
      await expect(moods.locator(`svg[data-mood="${mood}"]`)).toBeVisible();
      await expect(moods.getByRole("img", { name: `Galet ${mood}` })).toBeVisible();
    }
  });

  test("shows the fictitious visit header and its overdue reserve", async ({ page }) => {
    await page.goto("/design");
    await expect(
      page.getByText("LOG-118 · Entrepôt de Saint-Quentin-Fallavier (38)"),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Visite périodique" })).toBeVisible();
    await expect(page.getByText("Remplacer les butoirs des quais 14 et 15")).toBeVisible();
    await expect(page.getByText("Échéance 15/12/2026")).toBeVisible();
    const pill = page.locator('#visit [data-status="open"][data-overdue="true"]');
    await expect(pill).toHaveText("En retard");
  });

  test("the visit tabs switch panels", async ({ page }) => {
    await page.goto("/design");
    const tabs = page.getByRole("tablist", { name: "Sections de la visite" }).first();
    const labels = ["Informations", "Notes", "Réserves", "Photos", "Plans", "Rapport"];
    for (const label of labels) {
      await expect(tabs.getByRole("tab", { name: label })).toBeVisible();
    }
    await tabs.getByRole("tab", { name: "Photos" }).click();
    await expect(tabs.getByRole("tab", { name: "Photos" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByText("Contenu de l'onglet « Photos ».").first()).toBeVisible();
  });

  test("the confirmation dialog opens, traps focus and closes", async ({ page }) => {
    await page.goto("/design");
    await page.getByRole("button", { name: "Supprimer la photo" }).click();
    const dialog = page.getByRole("dialog", { name: "Supprimer cette photo ?" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Annuler" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("Aucune action pour l'instant.")).toBeVisible();
  });

  test("toasts show the mascot for success and error", async ({ page }) => {
    await page.goto("/design");
    await page.getByRole("button", { name: "Toast succès" }).click();
    const success = page.locator('[data-variant="success"]');
    await expect(success).toBeVisible();
    await expect(success.locator('svg[data-mood="happy"]')).toBeVisible();
    await page.getByRole("button", { name: "Toast erreur" }).click();
    const error = page.locator('[data-variant="error"]');
    await expect(error).toBeVisible();
    await expect(error.locator('svg[data-mood="worried"]')).toBeVisible();
  });
});
