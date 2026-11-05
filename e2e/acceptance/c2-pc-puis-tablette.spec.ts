/**
 * Critère 2 (cahier des charges, § 14) :
 * « Il la commence sur son ordinateur et la poursuit sur la tablette, sans rien perdre. »
 */
import { expect, test } from "../helpers/csp";

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
  writeNote,
} from "./helpers";

test.describe.configure({ mode: "serial" });

const PLAN_NAME = `Plan C2 ${Date.now().toString(36)}`;

test("C2 · commencée sur PC, poursuivie sur tablette, retrouvée sur PC, sans perte", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const { computer, tablet } = await computerAndTablet(browser);
  const pc = await computer.newPage();
  const tab = await tablet.newPage();

  // Sur le PC : informations, deux notes, une réserve (et le plan du site importé).
  await importPlan(pc, "TEST-002", PLAN("plan-5000x3500.png"), PLAN_NAME);
  const visitUrl = await createVisit(pc, "TEST-002", "Visite C2 Lille");
  await pc.fill("#visit-subject", "Contrôle commencé au bureau.");
  await pc.locator("#visit-subject").blur();
  await expect(pc.getByTestId("save-status")).toContainText("Enregistré à");
  await writeNote(pc, visitUrl, "roof", "Toiture vue depuis le bureau.\n- Lanterneau 2 à vérifier");
  await writeNote(pc, visitUrl, "docks", "Quais : rendez-vous à 14 h.");
  await createReserve(pc, visitUrl, "Réserve saisie sur PC", { priority: "high" });

  // Sur la tablette : tout est là, puis photo, repère et réserve.
  await tab.goto(visitUrl);
  await expect(tab.locator("#visit-subject")).toHaveValue("Contrôle commencé au bureau.");
  await tab.goto(`${visitUrl}?onglet=notes&zone=roof`);
  await expect(tab.getByTestId("zone-textarea")).toHaveValue(
    "Toiture vue depuis le bureau.\n- Lanterneau 2 à vérifier",
  );
  await tab.goto(`${visitUrl}?onglet=notes&zone=docks`);
  await expect(tab.getByTestId("zone-textarea")).toHaveValue("Quais : rendez-vous à 14 h.");
  await tab.goto(`${visitUrl}?onglet=reserves`);
  await expect(
    tab.getByTestId("reserve-card").filter({ hasText: "Réserve saisie sur PC" }),
  ).toBeVisible();
  await addPhotos(tab, visitUrl, [IMG("shapes.webp")], 1);
  await openPlan(tab, visitUrl, PLAN_NAME);
  await placeMarker(tab, 0.4, 0.5);
  await createReserve(tab, visitUrl, "Réserve saisie sur tablette", { priority: "urgent" });

  // De retour sur le PC, après rechargement : tout y est.
  await pc.goto(`${visitUrl}?onglet=reserves`);
  for (const action of ["Réserve saisie sur PC", "Réserve saisie sur tablette"]) {
    await expect(pc.getByTestId("reserve-card").filter({ hasText: action })).toBeVisible();
  }
  await pc.goto(`${visitUrl}?onglet=photos`);
  await expect(pc.getByTestId("photo-tile")).toHaveCount(1);
  await openPlan(pc, visitUrl, PLAN_NAME);
  await expect(pc.getByTestId("plan-marker")).toHaveCount(1);
  await pc.goto(`${visitUrl}?onglet=notes&zone=roof`);
  await expect(pc.getByTestId("zone-textarea")).toHaveValue(/Lanterneau 2 à vérifier$/);

  // Conflit : les deux modifient la même note ; le second est prévenu, rien n'est perdu.
  await tab.goto(`${visitUrl}?onglet=notes&zone=docks`);
  await pc.goto(`${visitUrl}?onglet=notes&zone=docks`);
  await tab.getByTestId("zone-textarea").fill("Quais : version tablette.");
  await expect(tab.getByTestId("note-save-status")).toContainText("Enregistré à");
  await pc.getByTestId("zone-textarea").fill("Quais : version PC.");
  const dialog = pc.getByTestId("note-conflict");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Quais : version tablette.");
  await expect(dialog).toContainText("Quais : version PC.");
  await dialog.getByRole("button", { name: "Garder ma version" }).click();
  await expect(pc.getByTestId("note-save-status")).toContainText("Enregistré à");
  await tab.reload();
  await expect(tab.getByTestId("zone-textarea")).toHaveValue("Quais : version PC.");

  await computer.close();
  await tablet.close();
});
