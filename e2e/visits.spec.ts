import { expect as baseExpect, type Page } from "@playwright/test";

import { test } from "./helpers/csp";

import { anonymousState, E2E_BASE_URL, loginAs, storageStatePath } from "./helpers/auth";

test.describe.configure({ mode: "serial" });

// Every step here waits for a server action (RPC, revalidation and a fresh render); the CI
// runner shares one PostgreSQL service between four workers, so give them room.
const expect = baseExpect.configure({ timeout: 15_000 });

let visitUrl = "";
let copyUrl = "";

async function openActions(page: Page, label: string) {
  const inline = page.getByTestId("visit-actions").getByRole("button", { name: label });
  if (await inline.isVisible()) {
    await inline.click();
  } else {
    await page.getByRole("button", { name: "Actions" }).click();
    await page
      .getByRole("dialog", { name: "Actions" })
      .getByRole("button", { name: label })
      .click();
  }
}

test.describe("Alice on a tablet", () => {
  test.use({ viewport: { width: 768, height: 1024 } });

  test("creates a visit from a site, fills the subject and two participants, and finds them after a reload", async ({
    page,
  }) => {
    await page.goto("/sites/TEST-001");
    await page.getByRole("link", { name: "Nouvelle visite sur ce site" }).click();
    await expect(page).toHaveURL(/\/visites\/nouvelle\?site=TEST-001$/);
    await expect(page.getByTestId("site-picker-selected")).toContainText("TEST-001");
    await expect(page.locator("#title")).toHaveValue(
      "Visite périodique — Entrepôt fictif Lyon Sud",
    );

    // A meeting only allows the « Réunion » reason; back to technical with another reason.
    await page.getByLabel("Réunion").check();
    await expect(page.locator("#reason option")).toHaveCount(1);
    await page.getByLabel("Visite technique").check();
    await page.selectOption("#reason", "post_claim");
    await expect(page.locator("#title")).toHaveValue("Après sinistre — Entrepôt fictif Lyon Sud");
    await page.fill("#title", "Visite e2e après sinistre");
    await page.getByRole("button", { name: "Créer la visite" }).click();
    await expect(page).toHaveURL(/\/visites\/[0-9a-f-]{36}/);
    visitUrl = page.url().split("?")[0]!;
    await expect(page.getByText("Visite créée").first()).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 1, name: "Visite e2e après sinistre" }),
    ).toBeVisible();
    await expect(page.getByTestId("incomplete-points")).toContainText("Aucun participant");

    await page.fill("#visit-subject", "Objet saisi sur tablette.");
    await page.locator("#visit-subject").blur();
    await expect(page.getByTestId("save-status")).toContainText("Enregistré à");

    await page.getByRole("button", { name: "Ajouter un participant" }).click();
    let dialog = page.getByRole("dialog", { name: "Ajouter un participant" });
    await dialog.locator("#participant-profile").selectOption({ label: "Bruno Fictif" });
    await dialog.getByRole("button", { name: "Ajouter" }).click();
    await expect(page.getByText("Participant ajouté").first()).toBeVisible();

    await page.getByRole("button", { name: "Ajouter un participant" }).click();
    dialog = page.getByRole("dialog", { name: "Ajouter un participant" });
    await dialog.getByRole("tab", { name: "Personne extérieure" }).click();
    await dialog.locator("#participant-name").fill("Marc Imaginaire");
    await dialog.locator("#participant-company").fill("Maintenance Fictive SAS");
    await dialog.locator("#participant-email").fill("pas-un-email");
    await dialog.getByRole("button", { name: "Ajouter" }).click();
    await expect(dialog.getByText("Adresse e-mail invalide.")).toBeVisible();
    await dialog.locator("#participant-email").fill("marc@example.test");
    await dialog.getByRole("button", { name: "Ajouter" }).click();
    await expect(page.getByTestId("participant")).toHaveCount(2);

    // Same colleague twice is refused.
    await page.getByRole("button", { name: "Ajouter un participant" }).click();
    dialog = page.getByRole("dialog", { name: "Ajouter un participant" });
    await expect(
      dialog.getByLabel(/Collègue/).locator("option", { hasText: "Bruno Fictif" }),
    ).toHaveCount(0);
    await page.keyboard.press("Escape");

    await page.reload();
    await expect(page.locator("#visit-subject")).toHaveValue("Objet saisi sur tablette.");
    await expect(page.getByTestId("participant")).toHaveCount(2);
    // Only the notes point remains: every zone of the fresh template is empty.
    await expect(page.getByTestId("incomplete-points")).toContainText("Aucune observation saisie");
    await expect(page.getByTestId("incomplete-points")).not.toContainText("Aucun participant");
    await expect(page.getByTestId("zones-counter")).toContainText("0/9 zones renseignées");

    await page.getByTestId("participant").nth(1).getByRole("switch").click();
    await expect(page.getByTestId("participant").nth(1).getByRole("switch")).toHaveText(/Absent/);
    await page.getByRole("button", { name: "Monter Marc Imaginaire" }).click();
    await expect(page.getByTestId("participant").first()).toContainText("Marc Imaginaire");
  });

  test("duplicates the visit with the expected content", async ({ page }) => {
    await page.goto(visitUrl);
    await openActions(page, "Dupliquer");
    const dialog = page.getByRole("dialog", { name: "Dupliquer cette visite ?" });
    await expect(dialog).toContainText("participants (tous présents)");
    await dialog.getByRole("button", { name: "Dupliquer" }).click();
    await expect(page).not.toHaveURL(visitUrl);
    await expect(page).toHaveURL(/\/visites\/[0-9a-f-]{36}/);
    copyUrl = page.url().split("?")[0]!;
    await expect(page.getByText("Visite dupliquée").first()).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 1, name: "Visite e2e après sinistre (suite)" }),
    ).toBeVisible();
    await expect(page.locator("#visit-subject")).toHaveValue("Objet saisi sur tablette.");
    await expect(page.locator("#visit-reason")).toHaveValue("post_claim");
    await expect(page.getByTestId("participant")).toHaveCount(2);
    await expect(page.locator("[role=switch][aria-checked=true]")).toHaveCount(2);
  });

  test("completes the visit, which locks the fields; Bruno (participant) cannot reopen it; Alice reopens then deletes", async ({
    page,
    browser,
  }) => {
    await page.goto(visitUrl);
    await openActions(page, "Terminer la visite");
    const dialog = page.getByRole("dialog", { name: "Terminer la visite ?" });
    await dialog.getByRole("button", { name: "Terminer la visite" }).click();
    await expect(page.getByText("Visite terminée").first()).toBeVisible();
    await expect(page.getByTestId("visit-banner")).toContainText("Visite terminée le");
    await expect(page.getByTestId("visit-info-readonly")).toBeVisible();
    await expect(page.locator("#visit-subject")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Ajouter un participant" })).toHaveCount(0);

    const bruno = await browser.newContext({
      baseURL: E2E_BASE_URL,
      storageState: storageStatePath("bruno"),
      viewport: { width: 1280, height: 800 },
    });
    const brunoPage = await bruno.newPage();
    await brunoPage.goto(visitUrl);
    await expect(brunoPage.getByTestId("visit-banner")).toContainText("Visite terminée");
    await expect(
      brunoPage.getByTestId("visit-actions").getByRole("button", { name: "Rouvrir" }),
    ).toHaveCount(0);
    await expect(
      brunoPage.getByTestId("visit-actions").getByRole("button", { name: "Supprimer" }),
    ).toHaveCount(0);
    await bruno.close();

    await openActions(page, "Rouvrir");
    await page
      .getByRole("dialog", { name: "Rouvrir la visite ?" })
      .getByRole("button", { name: "Rouvrir" })
      .click();
    await expect(page.getByText("Visite rouverte").first()).toBeVisible();
    await expect(page.locator("#visit-subject")).toBeVisible();

    await page.goto(copyUrl);
    await openActions(page, "Supprimer");
    const confirm = page.getByRole("dialog", { name: /Supprimer la visite/ });
    await confirm.getByRole("button", { name: "Supprimer" }).click();
    await expect(page).toHaveURL(/\/(\?.*)?$/);
    await expect(page.getByText("Visite supprimée").first()).toBeVisible();
    await expect(page.getByText("Visite e2e après sinistre (suite)")).toHaveCount(0);
    const response = await page.goto(copyUrl);
    expect(response?.status()).toBe(404);
  });
});

test.describe("David", () => {
  test.use({ storageState: storageStatePath("david") });

  test("sees the deleted visit with its banner", async ({ page }) => {
    await page.goto(copyUrl);
    await expect(page.getByTestId("visit-banner")).toContainText("Visite supprimée le");
    await expect(page.getByTestId("visit-info-readonly")).toBeVisible();
  });
});

test.describe("Claire", () => {
  test.use({ storageState: storageStatePath("claire") });

  test("reads everything without any edit control nor « Nouvelle visite »", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Nouvelle visite" })).toHaveCount(0);
    await expect(page.locator("nav[aria-label=Périmètre] a")).toHaveText(["Toutes les visites"]);
    await page.goto(visitUrl);
    await expect(page.getByTestId("visit-banner")).toContainText(
      "Vous consultez cette visite en lecture seule.",
    );
    await expect(page.getByTestId("visit-info-readonly")).toBeVisible();
    await expect(page.getByTestId("visit-actions")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Actions" })).toHaveCount(0);
    await expect(page.getByRole("switch").first()).toBeDisabled();
    const response = await page.goto("/visites/nouvelle");
    expect(response?.status()).toBe(403);
  });
});

test.describe("version conflict", () => {
  test("the second page is told who changed the visit and does not overwrite", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      baseURL: E2E_BASE_URL,
      storageState: storageStatePath("alice"),
    });
    const first = await context.newPage();
    const second = await context.newPage();
    await first.goto(visitUrl);
    await second.goto(visitUrl);
    await first.fill("#visit-title", "Titre de la première page");
    await first.locator("#visit-title").blur();
    await expect(first.getByTestId("save-status")).toContainText("Enregistré à");
    await second.fill("#visit-title", "Titre de la seconde page");
    await second.locator("#visit-title").blur();
    await expect(second.getByTestId("version-conflict")).toContainText(
      "modifiée entre-temps par Alice Fictive",
    );
    await second.getByRole("button", { name: "Recharger" }).click();
    await expect(second.locator("#visit-title")).toHaveValue("Titre de la première page");
    await context.close();
  });
});

test.describe("list filters", () => {
  test("are reflected in the URL and combine", async ({ page }) => {
    await page.goto("/?scope=all");
    // The conflict test above renamed the visit to « Titre de la première page ».
    await page.getByLabel("Rechercher").fill("premiere page");
    await expect(page).toHaveURL(/q=premiere\+page|q=premiere%20page/);
    await expect(
      page.locator("[data-testid^=visit-]").filter({ hasText: "Titre de la première page" }),
    ).toBeVisible();
    await page.getByLabel("Statut").selectOption("completed");
    await expect(page).toHaveURL(/status=completed/);
    await expect(page.getByRole("heading", { name: "Aucune visite ne correspond" })).toBeVisible();
    await page.getByRole("button", { name: "Effacer les filtres" }).click();
    await expect(page).not.toHaveURL(/status=/);
    await page.goto("/?from=2026-12-31&to=2026-01-01");
    await expect(page.getByText("La date de début est après la date de fin.")).toBeVisible();
    await page.goto("/?reason=meeting&scope=all");
    await expect(page).toHaveURL(/reason=meeting/);
  });

  test("the visit is listed in « Mes visites » for Alice and in the site page", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page
        .locator("[data-testid^=visit-]")
        .filter({ hasText: "Titre de la première page" })
        .first(),
    ).toBeVisible();
    await page.goto("/sites/TEST-001");
    await page
      .getByTestId("site-visit")
      .filter({ hasText: "Titre de la première page" })
      .first()
      .getByRole("link")
      .click();
    await expect(page).toHaveURL(new RegExp(visitUrl.replace(E2E_BASE_URL, "")));
  });
});

test.describe("visitor", () => {
  test.use({ storageState: anonymousState });

  test("is redirected from a visit page to the sign-in form", async ({ page }) => {
    await page.goto(visitUrl);
    await expect(page).toHaveURL(/\/connexion\?next=/);
    await loginAs(page, "alice", undefined, visitUrl.replace(E2E_BASE_URL, ""));
    await expect(page).toHaveURL(new RegExp(visitUrl.replace(E2E_BASE_URL, "")));
  });
});
