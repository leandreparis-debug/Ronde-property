/**
 * Critère 6 (cahier des charges, § 14) :
 * « Un groupe de RT pilotes mène de vraies visites avec RONDE et en valide l'usage. »
 *
 * Préparé à l'étape 11 : le critère se prouvera sur le terrain, pendant le pilote. Ce test vérifie
 * que les outils du pilote fonctionnent pour un RT : le guide est lisible dans l'application et
 * « Donner mon avis » arrive jusqu'à l'administrateur, qui peut l'exporter.
 */
import { readFile } from "node:fs/promises";

import { E2E_BASE_URL, storageStatePath } from "../helpers/auth";
import { expect, test } from "../helpers/csp";

const V1 = "/visites/20000000-0000-4000-8000-000000000001";
const BLOCKS = `Pilote C6 ${Date.now()} : je ne trouve pas le bouton pour terminer la visite.`;

test.describe.configure({ mode: "serial" });

test("C6 · un RT lit le guide des pilotes dans l'application", async ({ browser }) => {
  const tablet = await browser.newContext({
    baseURL: E2E_BASE_URL,
    storageState: storageStatePath("alice"),
    viewport: { width: 768, height: 1024 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await tablet.newPage();
  await page.goto("/");
  await page.getByTestId("account-menu-trigger").filter({ visible: true }).click();
  await page
    .getByTestId("account-menu")
    .filter({ visible: true })
    .getByRole("link", { name: "Aide" })
    .click();
  await page.getByTestId("guide-rt").click();
  const guide = page.getByTestId("guide");
  for (const heading of [
    "Installer RONDE sur la tablette",
    "Créer une visite",
    "Passer du PC à la tablette",
    "Générer le rapport",
    "Que faire si…",
  ]) {
    await expect(guide.getByRole("heading", { name: heading })).toBeVisible();
  }
  await tablet.close();
});

test("C6 · un RT donne son avis pendant une visite ; l'admin le lit et l'exporte", async ({
  browser,
}) => {
  const tablet = await browser.newContext({
    baseURL: E2E_BASE_URL,
    storageState: storageStatePath("alice"),
    viewport: { width: 768, height: 1024 },
    hasTouch: true,
    isMobile: true,
  });
  const rt = await tablet.newPage();
  await rt.goto(`${V1}?onglet=reserves`);
  await rt.getByTestId("account-menu-trigger").filter({ visible: true }).click();
  await rt.getByRole("button", { name: "Donner mon avis" }).filter({ visible: true }).click();
  const dialog = rt.getByTestId("feedback-dialog").filter({ visible: true });
  await dialog.getByText("Correct", { exact: true }).tap();
  await dialog.getByLabel("Ce qui marche").fill("Les réserves au doigt sur la tablette.");
  await dialog.getByLabel("Ce qui bloque").fill(BLOCKS);
  await dialog.getByTestId("feedback-submit").tap();
  await expect(dialog).toBeHidden();
  await tablet.close();

  const pc = await browser.newContext({
    baseURL: E2E_BASE_URL,
    storageState: storageStatePath("david"),
    viewport: { width: 1280, height: 800 },
  });
  const admin = await pc.newPage();
  await admin.goto("/admin/avis?bloque=1");
  const item = admin.getByTestId("feedback-item").filter({ hasText: BLOCKS });
  await expect(item).toContainText("Note 3/5");
  await expect(item).toContainText("Alice Fictive");
  await expect(item).toContainText(`Page ${V1}`);
  await expect(item).toContainText("écran 768x1024");

  const download = admin.waitForEvent("download");
  await admin.getByTestId("feedback-export").click();
  const csv = await readFile(await (await download).path(), "utf8");
  expect(csv).toContain(BLOCKS);
  await pc.close();
});
