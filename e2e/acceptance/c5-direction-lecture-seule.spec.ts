/**
 * Critère 5 (cahier des charges, § 14) :
 * « La direction consulte la visite et son rapport sans pouvoir les modifier. »
 */
import { expect, type Page, test } from "@playwright/test";

import { E2E_BASE_URL, storageStatePath } from "../helpers/auth";
import { generateReport } from "./helpers";

const V1 = "/visites/20000000-0000-4000-8000-000000000001";
const TABS = ["information", "notes", "reserves", "photos", "plans", "report"] as const;

/**
 * Controls Claire may use: navigation, tabs, filters, plan viewing tools and the report
 * (the direction may generate and download a report, which changes nothing in the visit).
 */
const ALLOWED = [
  /^Visites$|^Réserves$|^Sites$|^Informations$|^Notes$|^Photos$|^Plans$|^Rapport$/,
  /Masquer les levées|En retard uniquement|Statut|Priorité|Zone|Trier par|Toutes les zones|Catégorie|Sans légende/,
  /Ouvrir|Fermer|Afficher|Masquer|Zoomer|Dézoomer|Ajuster|Page|Plans|Télécharger|Aperçu|Options|Générer le rapport|Valider/,
  /Voir|Précédente|Suivante|Aide|Donner mon avis|compte|Compte|Déconnexion|Menu|Actions/,
  // Zone navigation of the Notes tab (« Toiture · Renseignée »).
  /(Renseignée|Vide)$/,
];

async function editingControls(page: Page): Promise<string[]> {
  const found = await page.locator("main").evaluate((main) => {
    const controls = main.querySelectorAll<HTMLElement>(
      "button:not([disabled]), input:not([disabled]):not([type=hidden]), textarea:not([disabled]):not([readonly]), select:not([disabled]), [contenteditable=true], [role=switch]:not([disabled])",
    );
    return [...controls]
      .filter((element) => element.offsetParent !== null || element.getClientRects().length > 0)
      .map((element) => {
        const label =
          element.getAttribute("aria-label") ||
          (element.id &&
            main.ownerDocument.querySelector(`label[for="${element.id}"]`)?.textContent) ||
          element.closest("label")?.textContent ||
          element.textContent ||
          element.getAttribute("name") ||
          element.tagName;
        return `${element.tagName.toLowerCase()}:${label.trim().replace(/\s+/g, " ").slice(0, 60)}`;
      });
  });
  return found.filter((control) => {
    const label = control.slice(control.indexOf(":") + 1);
    // Read-only filters are selects and checkboxes of the lists; their labels are allowed.
    return !ALLOWED.some((pattern) => pattern.test(label));
  });
}

test.describe.configure({ mode: "serial" });

test("C5 · préparation : Alice génère un rapport de V1", async ({ page }) => {
  test.setTimeout(180_000);
  await generateReport(page, V1);
});

test("C5 · Claire consulte chaque onglet sans aucun contrôle de modification, et télécharge le rapport", async ({
  browser,
}) => {
  const context = await browser.newContext({
    baseURL: E2E_BASE_URL,
    storageState: storageStatePath("claire"),
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();
  for (const tab of TABS) {
    await page.goto(`${V1}?onglet=${tab}`);
    await expect(page.getByRole("tab", { selected: true })).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(await editingControls(page), `onglet ${tab}`).toEqual([]);
  }
  await page.goto(`${V1}/reserves/50000000-0000-4000-8000-000000000001`);
  await expect(page.getByTestId("reserve-readonly")).toBeVisible();
  expect(await editingControls(page), "détail de réserve").toEqual([]);

  await page.goto(`${V1}?onglet=report`);
  const download = page.waitForEvent("download");
  await page.getByTestId("report-download").first().click();
  expect((await download).suggestedFilename()).toMatch(/^RONDE_TEST-001_.*\.pdf$/);
  await context.close();
});

test("C5 · une action serveur rejouée avec la session de Claire est refusée", async ({
  browser,
}) => {
  // Alice saves the subject: the request of the server action is recorded…
  const alice = await browser.newContext({
    baseURL: E2E_BASE_URL,
    storageState: storageStatePath("alice"),
  });
  const page = await alice.newPage();
  await page.goto(V1);
  const recorded = page.waitForRequest(
    (request) => request.method() === "POST" && Boolean(request.headers()["next-action"]),
  );
  const original = await page.locator("#visit-subject").inputValue();
  await page.fill("#visit-subject", `${original} (revu)`);
  await page.locator("#visit-subject").blur();
  const request = await recorded;
  await expect(page.getByTestId("save-status")).toContainText("Enregistré à");
  const headers = request.headers();
  const body = (request.postData() ?? "").replace(`${original} (revu)`, "Modifié par la direction");
  await alice.close();

  // …then replayed from Claire's browser (her session cookies): refused, nothing changes.
  const claire = await browser.newContext({
    baseURL: E2E_BASE_URL,
    storageState: storageStatePath("claire"),
  });
  const replay = await claire.newPage();
  await replay.goto(V1);
  const answer = await replay.evaluate(
    async ({ url, action, tree, payload }) => {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "next-action": action,
          "next-router-state-tree": tree,
          "content-type": "text/plain;charset=UTF-8",
          accept: "text/x-component",
        },
        body: payload,
      });
      return response.text();
    },
    {
      url: request.url(),
      action: headers["next-action"]!,
      tree: headers["next-router-state-tree"] ?? "",
      payload: body,
    },
  );
  expect(answer).toContain('"ok":false');
  expect(answer).toContain("pas le droit");
  const check = await claire.newPage();
  await check.goto(V1);
  await expect(check.getByText("Modifié par la direction")).toHaveCount(0);
  await claire.close();
});
