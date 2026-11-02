import { expect as baseExpect, type Page, test } from "@playwright/test";

import { E2E_BASE_URL, storageStatePath } from "./helpers/auth";

test.describe.configure({ mode: "serial" });

// Server actions, revalidation and a fresh render on a shared CI runner.
const expect = baseExpect.configure({ timeout: 15_000 });

const V1 = "/visites/20000000-0000-4000-8000-000000000001";
let visitUrl = "";

const textarea = (page: Page) => page.getByTestId("zone-textarea");
const status = (page: Page) => page.getByTestId("note-save-status");

test.describe("Alice on a laptop", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("creates a technical visit with the nine zones and writes « Toiture » with two bullets", async ({
    page,
  }) => {
    await page.goto("/visites/nouvelle?site=TEST-004");
    await page.fill("#title", "Visite e2e notes");
    await page.getByRole("button", { name: "Créer la visite" }).click();
    await expect(page).toHaveURL(/\/visites\/[0-9a-f-]{36}/);
    visitUrl = page.url().split("?")[0]!;
    await expect(page.getByTestId("zones-counter")).toContainText("0/9 zones renseignées");

    await page.getByRole("tab", { name: "Notes" }).click();
    await expect(page).toHaveURL(/onglet=notes/);
    const zones = page.getByTestId("zone-item");
    await expect(zones).toHaveCount(9);
    await expect(zones.first()).toContainText("Toiture");
    await expect(zones.first()).toContainText("Vide");
    await expect(zones.nth(8)).toContainText("Sécurité incendie");

    await textarea(page).fill(
      "Étanchéité correcte.\n- Lanterneau 3 à nettoyer\n- Lanterneau 7 fissuré",
    );
    await expect(status(page)).toContainText("Enregistré à");
    await expect(zones.first()).toContainText("Renseignée");

    await page.getByRole("button", { name: "Aperçu du rapport" }).click();
    const preview = page.getByTestId("zone-preview");
    await expect(preview.locator("p")).toHaveText("Étanchéité correcte.");
    await expect(preview.locator("li")).toHaveText([
      "Lanterneau 3 à nettoyer",
      "Lanterneau 7 fissuré",
    ]);
    await page.getByRole("button", { name: "Saisie" }).click();

    await page.reload();
    // No explicit zone in the URL: the first zone is shown.
    await expect(page.locator("[data-testid=zone-editor] h3")).toHaveText("Toiture");
    await expect(textarea(page)).toHaveValue(/Lanterneau 7 fissuré$/);
    await expect(page.getByTestId("zones-counter")).toContainText("1/9 zones renseignées");
  });

  test("inserts a bullet with the toolbar on the current line and on a selection", async ({
    page,
  }) => {
    await page.goto(`${visitUrl}?onglet=notes&zone=docks`);
    await textarea(page).fill("Quai 14\nQuai 15");
    await textarea(page).press("Control+Home");
    await page.getByRole("button", { name: /Puce/ }).click();
    await expect(textarea(page)).toHaveValue("- Quai 14\nQuai 15");
    await textarea(page).press("Control+A");
    await page.getByRole("button", { name: /Puce/ }).click();
    await expect(textarea(page)).toHaveValue("- Quai 14\n- Quai 15");
    await expect(status(page)).toContainText("Enregistré à");
  });

  test("adds « Local sprinkler », moves it up, renames it, and cannot remove a filled zone", async ({
    page,
  }) => {
    await page.goto(`${visitUrl}?onglet=notes`);
    await page.getByRole("button", { name: "Gérer les zones" }).click();
    const dialog = page.getByTestId("manage-zones");

    await dialog.locator("#new-zone-label").fill("   ");
    await dialog.getByRole("button", { name: "Ajouter" }).click();
    await expect(dialog.getByRole("alert")).toContainText("libellé de la zone est obligatoire");
    await dialog.locator("#new-zone-label").fill("toiture");
    await dialog.getByRole("button", { name: "Ajouter" }).click();
    await expect(dialog.getByRole("alert")).toContainText("porte déjà ce libellé");

    await dialog.locator("#new-zone-label").fill("Local sprinkler");
    await dialog.getByRole("button", { name: "Ajouter" }).click();
    await expect(dialog.getByTestId("manage-zone")).toHaveCount(10);
    await expect(dialog.getByTestId("manage-zone").nth(9)).toContainText("Local sprinkler");

    await dialog.getByRole("button", { name: "Monter Local sprinkler" }).click();
    await expect(dialog.getByTestId("manage-zone").nth(8)).toContainText("Local sprinkler");
    await dialog.getByRole("button", { name: "Renommer Local sprinkler" }).click();
    await dialog.getByLabel("Nouveau libellé de Local sprinkler").fill("Local sprinkler (RDC)");
    await dialog.getByRole("button", { name: "Valider le libellé" }).click();
    await expect(dialog.getByTestId("manage-zone").nth(8)).toContainText("Local sprinkler (RDC)");

    await expect(dialog.getByRole("button", { name: "Retirer Toiture" })).toBeDisabled();
    await expect(dialog).toContainText("videz la zone avant de la retirer");
    await dialog.getByRole("button", { name: "Retirer Local sprinkler (RDC)" }).click();
    await expect(dialog.getByTestId("manage-zone")).toHaveCount(9);
    await dialog.getByRole("button", { name: "Fermer" }).click();
    await expect(page.getByTestId("zone-item")).toHaveCount(9);
  });

  test("keeps the text while the server is unreachable, then saves it when it is back", async ({
    page,
  }) => {
    await page.goto(`${visitUrl}?onglet=notes&zone=sprinkler`);
    await page.route("**/visites/**", (route) =>
      route.request().method() === "POST" ? route.abort("connectionfailed") : route.continue(),
    );
    await textarea(page).fill("Essai pompe conforme malgré la coupure.");
    await expect(status(page)).toContainText("Hors connexion : nouvelle tentative…");
    await expect(page.getByTestId("zone-item").nth(2)).toContainText("Hors connexion");
    await expect(textarea(page)).toHaveValue("Essai pompe conforme malgré la coupure.");
    await page.unroute("**/visites/**");
    await expect(status(page)).toContainText("Enregistré à");
    await page.reload();
    await expect(textarea(page)).toHaveValue("Essai pompe conforme malgré la coupure.");
  });
});

test.describe("two writers on the seed visit", () => {
  test("Bruno writes « Quais » while Alice writes « Toiture » without any conflict", async ({
    browser,
  }) => {
    const alice = await browser.newContext({
      baseURL: E2E_BASE_URL,
      storageState: storageStatePath("alice"),
    });
    const bruno = await browser.newContext({
      baseURL: E2E_BASE_URL,
      storageState: storageStatePath("bruno"),
    });
    const a = await alice.newPage();
    const b = await bruno.newPage();
    await a.goto(`${V1}?onglet=notes&zone=roof`);
    await b.goto(`${V1}?onglet=notes&zone=docks`);
    await textarea(a).fill("Toiture vue par Alice.");
    await textarea(b).fill("Quais vus par Bruno.");
    await expect(status(a)).toContainText("Enregistré à");
    await expect(status(b)).toContainText("Enregistré à");
    await expect(a.getByTestId("note-conflict")).toHaveCount(0);
    await expect(b.getByTestId("note-conflict")).toHaveCount(0);
    await a.reload();
    await expect(textarea(a)).toHaveValue("Toiture vue par Alice.");
    await a.goto(`${V1}?onglet=notes&zone=docks`);
    await expect(textarea(a)).toHaveValue("Quais vus par Bruno.");
    await expect(a.getByTestId("note-last-author")).toContainText("Modifié par Bruno Fictif à");
    await alice.close();
    await bruno.close();
  });

  test("both edit « Toiture »: Alice gets the conflict dialog and keeps her version", async ({
    browser,
  }) => {
    const alice = await browser.newContext({
      baseURL: E2E_BASE_URL,
      storageState: storageStatePath("alice"),
    });
    const bruno = await browser.newContext({
      baseURL: E2E_BASE_URL,
      storageState: storageStatePath("bruno"),
    });
    const a = await alice.newPage();
    const b = await bruno.newPage();
    await a.goto(`${V1}?onglet=notes&zone=roof`);
    await b.goto(`${V1}?onglet=notes&zone=roof`);
    await textarea(b).fill("Version de Bruno");
    await expect(status(b)).toContainText("Enregistré à");
    await textarea(a).fill("Version d'Alice");
    const dialog = a.getByTestId("note-conflict");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Bruno Fictif a modifié cette zone à");
    await expect(dialog).toContainText("Version de Bruno");
    await expect(dialog).toContainText("Version d'Alice");
    await dialog.getByRole("button", { name: "Garder ma version" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(status(a)).toContainText("Enregistré à");
    await b.reload();
    await expect(textarea(b)).toHaveValue("Version d'Alice");
    await expect(b.getByTestId("note-last-author")).toContainText("Modifié par Alice Fictive à");

    // Second round: Alice takes Bruno's text this time.
    await textarea(b).fill("Version de Bruno, bis");
    await expect(status(b)).toContainText("Enregistré à");
    await textarea(a).fill("Version d'Alice, bis");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Prendre la sienne" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(textarea(a)).toHaveValue("Version de Bruno, bis");
    await expect(
      a.getByText(/Votre texte a été copié|Sa version a été reprise/).first(),
    ).toBeVisible();
    await alice.close();
    await bruno.close();
  });
});

test.describe("Alice on a tablet", () => {
  test.use({ viewport: { width: 768, height: 1024 } });

  test("moves between zones with « Zone suivante » and the pills", async ({ page }) => {
    await page.goto(`${visitUrl}?onglet=notes`);
    await expect(page.getByTestId("zone-chip")).toHaveCount(9);
    await expect(page.getByTestId("zone-item").first()).toBeHidden();
    await expect(page.getByRole("button", { name: "Zone précédente" })).toBeDisabled();
    await page.getByRole("button", { name: "Zone suivante" }).click();
    await expect(page).toHaveURL(/zone=docks/);
    await expect(page.locator("[data-testid=zone-editor] h3")).toHaveText("Quais");
    await page.getByTestId("zone-chip").filter({ hasText: "Sécurité incendie" }).click();
    await expect(page).toHaveURL(/zone=fire_safety/);
    await expect(page.getByRole("button", { name: "Zone suivante" })).toBeDisabled();
  });
});

test.describe("Claire", () => {
  test.use({ storageState: storageStatePath("claire") });

  test("reads the formatted notes without any editor", async ({ page }) => {
    await page.goto(`${visitUrl}?onglet=notes&zone=roof`);
    await expect(page.getByTestId("visit-banner")).toContainText("lecture seule");
    const zone = page.getByTestId("zone-readonly");
    await expect(zone.locator("p").first()).toHaveText("Étanchéité correcte.");
    await expect(zone.locator("li")).toHaveCount(2);
    await expect(page.getByTestId("zone-editor")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Gérer les zones" })).toHaveCount(0);
    await page.getByTestId("zone-item").filter({ hasText: "Désenfumage" }).click();
    await expect(page.getByTestId("zone-readonly")).toContainText("Aucune observation");
  });
});
