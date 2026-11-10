/**
 * Critère 3 (cahier des charges, § 14) :
 * « Il saisit des notes, des photos, des repères sur plan et des réserves, comme dans
 * CR Visites. »
 */
import { expect, test } from "../helpers/csp";

import {
  addNoteOnPlan,
  addPhotoOnPlan,
  addPhotos,
  computerAndTablet,
  createReserve,
  createVisit,
  IMG,
  importPlan,
  openView,
  PLAN,
  tapPlan,
  viewLoaded,
  writeNote,
} from "./helpers";

const PLAN_NAME = `Plan C3 ${Date.now().toString(36)}`;
const BUILDING = `Bât. C3 ${Date.now().toString(36)}`;

test("C3 · notes à puces, photos avec photo de garde, plan et repères, réserves, sur tablette", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const { computer, tablet } = await computerAndTablet(browser);
  await computer.close();
  const page = await tablet.newPage();

  await importPlan(page, "TEST-003", PLAN("plan-5000x3500.png"), PLAN_NAME, {
    building: BUILDING,
  });
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

  // Sur l'écran Plan (étape 12 b) : une photo placée et une note, par le menu rapide.
  await openView(page, visitUrl, BUILDING);
  await addPhotoOnPlan(page, 0.25, 0.3, IMG("gradient.png"));
  await page.getByTestId("photo-sheet-done").tap();
  await addNoteOnPlan(page, 0.7, 0.6, "Odeur de gaz près du local de charge");

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
  await expect(page.getByTestId("placing-hint")).toBeVisible();
  // The placement survives the navigation to the building.
  await page.getByTestId("plan-screen").waitFor();
  if ((await page.locator(`[data-testid=building-card][data-name="${BUILDING}"]`).count()) === 0) {
    await page.goto(`${page.url()}&vue=batiments`);
  }
  await page.locator(`[data-testid=building-card][data-name="${BUILDING}"]`).click();
  await viewLoaded(page);
  await expect(page.getByTestId("placing-hint")).toBeVisible();
  await tapPlan(page, 0.5, 0.45);
  await expect(page.getByTestId("reserve-plan-link")).toContainText(PLAN_NAME);

  // Tout est retrouvé après rechargement.
  for (const [zone, text] of Object.entries(notes)) {
    await page.goto(`${visitUrl}?onglet=notes&zone=${zone}`);
    await expect(page.getByTestId("zone-textarea")).toHaveValue(text);
  }
  await page.goto(`${visitUrl}?onglet=photos`);
  await expect(page.getByTestId("photo-tile")).toHaveCount(4);
  await expect(page.getByTestId("cover-star")).toHaveCount(1);
  await openView(page, visitUrl, BUILDING);
  await expect(page.getByTestId("plan-marker")).toHaveCount(3);
  await expect(page.locator("[data-testid=plan-marker][data-kind=note]")).toHaveCount(1);
  await expect(page.locator("[data-testid=plan-marker][data-kind=photo]")).toHaveCount(1);
  await expect(page.locator("[data-testid=plan-marker][data-reserve]")).toHaveCount(1);
  await page.goto(`${visitUrl}?onglet=reserves`);
  await expect(page.getByTestId("reserve-card")).toHaveCount(3);
  await expect(page.getByTestId("reserves-counters")).toContainText("3 ouvertes");
  await tablet.close();
});
