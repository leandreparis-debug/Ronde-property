/**
 * Critère 7 (cahier des charges, « Mode hors réseau ») :
 * « ouvrir une visite déjà commencée et la poursuivre sans réseau ;
 *   prendre des photos et saisir des réserves hors réseau ;
 *   voir si des modifications attendent d'être synchronisées ;
 *   la synchronisation se lance seule au retour du réseau ;
 *   la création d'une visite peut demander une connexion. »
 */
import { expect, test } from "../helpers/csp";
import { expectMood, expectPending, indicator, openSyncPanel } from "../helpers/offline";

import { computerAndTablet, createVisit, IMG, writeNote } from "./helpers";

test.describe.configure({ mode: "serial" });

test("C7 · visite commencée, poursuivie sans réseau, synchronisée seule au retour du réseau", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const { computer, tablet } = await computerAndTablet(browser);
  const pc = await computer.newPage();
  const tab = await tablet.newPage();

  // Une visite commencée sur le PC…
  const visitUrl = await createVisit(pc, "TEST-011", "Visite C7 hors réseau");
  await writeNote(pc, visitUrl, "roof", "Toiture : constat commencé au bureau.");

  // … ouverte une fois sur la tablette, qui la garde hors réseau d'elle-même.
  await tab.goto(visitUrl);
  await expect(tab.getByTestId("kept-offline-badge")).toBeVisible({ timeout: 20_000 });
  await expect
    .poll(() =>
      tab.evaluate(async () => {
        await navigator.serviceWorker.ready;
        return navigator.serviceWorker.controller !== null;
      }),
    )
    .toBe(true);
  // Les écrans de saisie sont ouverts une fois avec le réseau (comme sur le terrain).
  await tab.goto(`${visitUrl}?onglet=photos`);
  await expect(tab.getByTestId("photos-tab")).toHaveAttribute("data-ready", "true");

  // 1. Ouvrir une visite déjà commencée et la poursuivre sans réseau (même après rechargement).
  await tablet.setOffline(true);
  await tab.goto(`${visitUrl}?onglet=notes&zone=roof`);
  await expect(tab.getByTestId("offline-shell")).toBeVisible();
  await expect(tab.getByTestId("zone-textarea")).toHaveValue(
    "Toiture : constat commencé au bureau.",
  );
  await tab
    .getByTestId("zone-textarea")
    .fill("Toiture : constat commencé au bureau.\n- Lanterneau 5 fissuré (vu sur place)");
  await expect(tab.getByTestId("note-save-status")).toContainText("Hors réseau");

  // 2. Prendre des photos et saisir des réserves hors réseau.
  await tab.getByRole("tab", { name: "Photos" }).click();
  await expect(tab.getByTestId("photos-tab")).toHaveAttribute("data-ready", "true");
  await tab
    .getByTestId("photos-tab")
    .getByTestId("import-input")
    .first()
    .setInputFiles([IMG("shapes.webp")]);
  await expect(tab.getByTestId("photo-tile")).toHaveCount(1, { timeout: 60_000 });
  await tab.getByRole("tab", { name: "Réserves" }).click();
  await tab.getByTestId("reserve-new-fab").click();
  await tab.getByTestId("reserve-action").fill("Remplacer le lanterneau 5");
  await tab.getByTestId("reserve-save").click();
  const reserve = tab.getByTestId("reserve-card").filter({ hasText: "Remplacer le lanterneau 5" });
  await expect(reserve).toContainText("R-?");

  // 3. Voir que des modifications attendent d'être synchronisées.
  await expectMood(tab, "asleep");
  await expect(indicator(tab).getByTestId("sync-count")).not.toHaveText("0");
  const panel = await openSyncPanel(tab);
  await expect(panel).toContainText("Gardée sur la tablette");
  await tab.keyboard.press("Escape");

  // 5. La création d'une visite demande une connexion (et le dit).
  await tab.goto("/");
  await expect(tab.getByTestId("new-visit-offline")).toBeDisabled();
  await expect(tab.getByTestId("offline-reason-new-visit")).toBeVisible();
  await expect(tab.getByTestId("offline-visit-list")).toContainText("Visite C7 hors réseau");

  // 4. La synchronisation se lance seule au retour du réseau : aucun geste.
  await tab.goto(`${visitUrl}?onglet=reserves`);
  await tablet.setOffline(false);
  await expectPending(tab, 0, 60_000);
  await expectMood(tab, "happy");
  await expect(reserve).toContainText(/R-\d+/);

  // Sur le PC, tout est arrivé.
  await pc.goto(`${visitUrl}?onglet=notes&zone=roof`);
  await expect(pc.getByTestId("zone-textarea")).toHaveValue(
    "Toiture : constat commencé au bureau.\n- Lanterneau 5 fissuré (vu sur place)",
  );
  await pc.goto(`${visitUrl}?onglet=photos`);
  await expect(pc.getByTestId("photo-tile")).toHaveCount(1);
  await pc.goto(`${visitUrl}?onglet=reserves`);
  await expect(
    pc.getByTestId("reserve-card").filter({ hasText: "Remplacer le lanterneau 5" }),
  ).toContainText(/R-\d+/);
  await computer.close();
  await tablet.close();
});
