/**
 * Critère 3 (cahier des charges, § 14) :
 * « Il saisit des notes, des photos, des repères sur plan et des réserves, comme dans
 * CR Visites. »
 */
import { expect, test } from "@playwright/test";

import {
  addPhotos,
  computerAndTablet,
  createReserve,
  createVisit,
  IMG,
  importPlan,
  openPlan,
  PLAN,
  placeMarker,
  tapPlan,
  writeNote,
} from "./helpers";

const PLAN_NAME = `Plan C3 ${Date.now().toString(36)}`;

test("C3 · notes à puces, photos avec photo de garde, plan et repères, réserves, sur tablette", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const { computer, tablet } = await computerAndTablet(browser);
  await computer.close();
  const page = await tablet.newPage();

  await importPlan(page, "TEST-003", PLAN("plan-5000x3500.png"), PLAN_NAME);
  const visitUrl = await createVisit(page, "TEST-003", "Visite C3 Marseille");

  // Notes de trois zones, avec des puces.
  const notes: Record<string, string> = {
    roof: "Étanchéité correcte.\n- Lanterneau 1 fissuré\n- Évacuation à déboucher",
    docks: "- Butoir 4 arraché\n- Niveleur 6 bruyant",
    sprinkler: "Essai pompe conforme.\n- Registre à jour",
  };
  for (const [zone, text] of Object.entries(notes)) await writeNote(page, visitUrl, zone, text);

  // Trois photos, dont la photo de garde.
  await addPhotos(
    page,
    visitUrl,
    [IMG("shapes.webp"), IMG("gradient.png"), IMG("exif-orientation-6.jpg")],
    3,
  );
  await page.getByTestId("photo-tile").nth(1).click();
  const viewer = page.getByTestId("photo-viewer");
  await viewer.getByTestId("set-cover").click();
  await expect(viewer.getByTestId("set-cover")).toBeDisabled();
  await viewer.getByRole("button", { name: "Fermer la visionneuse" }).click();
  await expect(page).not.toHaveURL(/photo=/);

  // Un plan importé avec deux repères.
  await openPlan(page, visitUrl, PLAN_NAME);
  await placeMarker(page, 0.25, 0.3);
  await page.getByRole("button", { name: "Fermer la feuille du repère" }).click();
  await placeMarker(page, 0.7, 0.6);

  // Trois réserves, dont une placée sur le plan.
  await createReserve(page, visitUrl, "Remplacer le butoir 4", {
    priority: "urgent",
    zone: "docks",
  });
  await createReserve(page, visitUrl, "Déboucher l'évacuation de toiture", { zone: "roof" });
  await createReserve(page, visitUrl, "Mettre à jour le registre sprinkler", { priority: "low" });
  await page
    .getByTestId("reserve-card")
    .filter({ hasText: "Remplacer le butoir 4" })
    .getByTestId("reserve-card-link")
    .click();
  await page.getByTestId("reserve-place").click();
  await page.getByRole("button", { name: new RegExp(`Ouvrir le plan.*${PLAN_NAME}`) }).click();
  await expect(page.getByTestId("place-reserve-hint")).toBeVisible();
  await expect(page.getByTestId("plan-page-image")).toHaveJSProperty("complete", true);
  await tapPlan(page, 0.5, 0.45);
  await expect(page.getByTestId("reserve-plan-link")).toContainText(PLAN_NAME);

  // Tout est retrouvé après rechargement.
  for (const [zone, text] of Object.entries(notes)) {
    await page.goto(`${visitUrl}?onglet=notes&zone=${zone}`);
    await expect(page.getByTestId("zone-textarea")).toHaveValue(text);
  }
  await page.goto(`${visitUrl}?onglet=photos`);
  await expect(page.getByTestId("photo-tile")).toHaveCount(3);
  await expect(page.getByTestId("cover-star")).toHaveCount(1);
  await openPlan(page, visitUrl, PLAN_NAME);
  await expect(page.getByTestId("plan-marker")).toHaveCount(3);
  await expect(page.locator("[data-testid=plan-marker][data-reserve]")).toHaveCount(1);
  await page.goto(`${visitUrl}?onglet=reserves`);
  await expect(page.getByTestId("reserve-card")).toHaveCount(3);
  await expect(page.getByTestId("reserves-counters")).toContainText("3 ouvertes");
  await tablet.close();
});
