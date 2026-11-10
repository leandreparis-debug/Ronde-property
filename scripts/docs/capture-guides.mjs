/**
 * Screenshots of the guides (docs/guide-rt.md, docs/guide-admin.md), saved in
 * public/aide-images/. Fictitious data only: run against the local server (`pnpm start` on
 * port 3100 with the local providers) after `pnpm db:reset` and the demo visit of step 10
 * (tests/integration/demo-report-visit.test.ts, LOCAL_STORAGE_DIR=.storage/e2e). The step 12
 * screenshots keep the demo visit offline, change two notes without network and arbitrate
 * a note changed meanwhile on the computer.
 *
 *   node scripts/docs/capture-guides.mjs [baseUrl]
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.join(ROOT, "public", "aide-images");
const BASE = process.argv[2] ?? "http://127.0.0.1:3100";
const PASSWORD = "Ronde-test-2026";
const TABLET = { width: 768, height: 1024 };
const PC = { width: 1280, height: 800 };

async function signedIn(browser, email, viewport) {
  const context = await browser.newContext({ baseURL: BASE, viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto("/connexion");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/connexion"));
  return page;
}

/** Waits for the fonts and for the end of the finite animations (dialogs, sheets, toasts). */
async function settle(page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every(
        (animation) =>
          animation.playState !== "running" ||
          animation.effect?.getTiming().iterations === Infinity,
      ),
  );
}

async function shot(page, name, { fullPage = false } = {}) {
  await page.waitForLoadState("networkidle");
  await settle(page);
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage });
  console.log(`public/aide-images/${name}.png`);
}

async function demoVisitUrl(page) {
  await page.goto("/");
  const link = page.getByRole("link", { name: /Visite périodique de démonstration/ }).first();
  return (await link.getAttribute("href")).split("?")[0];
}

const browser = await chromium.launch();
try {
  // Sign-in screen (no session).
  const anonymous = await browser.newPage({ viewport: TABLET });
  await anonymous.goto(`${BASE}/connexion`);
  await shot(anonymous, "connexion");
  await anonymous.close();

  // RT on a tablet.
  const rt = await signedIn(browser, "rt.alice@example.test", TABLET);
  await rt.goto("/");
  await shot(rt, "mes-visites");
  await rt.goto("/visites/nouvelle?site=TEST-001");
  await shot(rt, "nouvelle-visite");
  const visit = await demoVisitUrl(rt);
  for (const [tab, name] of [
    ["information", "visite-informations"],
    ["notes", "visite-notes"],
    ["photos", "visite-photos"],
    ["reserves", "visite-reserves"],
    ["report", "visite-rapport"],
  ]) {
    await rt.goto(`${visit}?onglet=${tab}`);
    await shot(rt, name);
  }
  await rt.goto(`${visit}?onglet=plans`);
  await rt
    .getByRole("button", { name: /Ouvrir le plan/ })
    .first()
    .click();
  await rt.getByTestId("plan-page-image").waitFor();
  await shot(rt, "visite-plan");

  await rt.goto(visit);
  await rt.getByTestId("account-menu-trigger").filter({ visible: true }).click();
  await shot(rt, "menu-compte");
  await rt.getByRole("button", { name: "Donner mon avis" }).filter({ visible: true }).click();
  await rt.getByTestId("feedback-dialog").getByText("Bien", { exact: true }).click();
  await rt.getByLabel("Ce qui marche").fill("Les notes à puces sur la tablette, le plan au doigt.");
  await rt.getByLabel("Ce qui bloque").fill("Je cherche le bouton pour terminer la visite.");
  await shot(rt, "donner-mon-avis");
  // Sent, so that the admin screenshot of /admin/avis is not empty (fictitious feedback).
  await rt.getByTestId("feedback-submit").filter({ visible: true }).click();
  await rt.getByTestId("feedback-dialog").filter({ visible: true }).waitFor({ state: "hidden" });

  await rt.context().setOffline(true);
  await rt.getByTestId("offline-banner").waitFor();
  await rt.screenshot({ path: path.join(OUT, "hors-connexion.png") });
  console.log("public/aide-images/hors-connexion.png");
  await rt.context().setOffline(false);

  // Step 12: « Garder hors réseau », the Galet asleep, the waiting changes, « À arbitrer ».
  await rt.goto(visit);
  await rt.getByRole("button", { name: "Actions", exact: true }).click();
  await rt.getByRole("dialog", { name: "Actions" }).getByTestId("visit-action-keep").click();
  await rt.getByTestId("keep-offline-size").filter({ hasText: /o\b/ }).waitFor();
  await shot(rt, "garder-hors-reseau");
  await rt.getByTestId("keep-offline-start").click();
  await rt.getByTestId("kept-offline-badge").waitFor({ timeout: 120_000 });

  await rt.goto(`${visit}?onglet=notes&zone=roof`);
  const roof = await rt.getByTestId("zone-textarea").inputValue();
  await rt.context().setOffline(true);
  await rt
    .getByTestId("zone-textarea")
    .fill(`${roof}\n- Lanterneau 2 : joint à reprendre (vu sur place)`);
  await rt.getByRole("button", { name: /Zone suivante/ }).click();
  const docks = await rt.getByTestId("zone-textarea").inputValue();
  await rt.getByTestId("zone-textarea").fill(`${docks}\n- Quai 3 : butoir fendu`);
  await rt.getByTestId("note-save-status").filter({ hasText: "Hors réseau" }).waitFor();
  await rt.getByTestId("sync-indicator").filter({ visible: true }).click();
  await rt.getByTestId("sync-panel").waitFor();
  await rt.keyboard.press("Escape");
  await rt.getByTestId("sync-panel").waitFor({ state: "hidden" });
  await settle(rt);
  await rt.screenshot({ path: path.join(OUT, "galet-hors-reseau.png") });
  console.log("public/aide-images/galet-hors-reseau.png");
  await rt.getByTestId("sync-indicator").filter({ visible: true }).click();
  await rt.getByTestId("sync-waiting-item").first().waitFor();
  await settle(rt);
  await rt.screenshot({ path: path.join(OUT, "synchronisation.png") });
  console.log("public/aide-images/synchronisation.png");
  await rt.keyboard.press("Escape");

  // Meanwhile, the same zone is changed on the computer.
  const desk = await signedIn(browser, "rt.alice@example.test", PC);
  await desk.goto(`${visit}?onglet=notes&zone=roof`);
  await desk
    .getByTestId("zone-textarea")
    .fill(`${roof}\n- Lanterneau 2 : à surveiller (noté au bureau)`);
  await desk.getByTestId("note-save-status").filter({ hasText: "Enregistré à" }).waitFor();
  await desk.context().close();

  await rt.getByRole("tab", { name: "Informations" }).click();
  await rt.context().setOffline(false);
  await rt
    .locator("[data-testid=sync-indicator][data-mood=worried]")
    .first()
    .waitFor({ state: "attached" });
  await rt.getByTestId("sync-indicator").filter({ visible: true }).click();
  await rt.getByTestId("sync-arbitrate").first().click();
  await rt.getByTestId("arbitration-dialog").waitFor();
  await settle(rt);
  await rt.screenshot({ path: path.join(OUT, "a-arbitrer.png") });
  console.log("public/aide-images/a-arbitrer.png");
  await rt.getByTestId("arbitration-mine-keep").click();
  await rt
    .locator("[data-testid=sync-indicator][data-mood=happy]")
    .first()
    .waitFor({ state: "attached" });
  await rt.context().close();

  // Admin on a PC.
  const admin = await signedIn(browser, "admin.david@example.test", PC);
  for (const [url, name] of [
    ["/admin/comptes", "admin-comptes"],
    ["/admin/sites/import", "admin-import-sites"],
    ["/admin/avis", "admin-avis"],
    ["/admin/journal", "admin-journal"],
  ]) {
    await admin.goto(url);
    await shot(admin, name);
  }
  await admin.goto("/aide");
  await shot(admin, "aide");
  await admin.context().close();
} finally {
  await browser.close();
}
