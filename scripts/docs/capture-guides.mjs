/**
 * Screenshots of the guides (docs/guide-rt.md, docs/guide-admin.md), saved in
 * public/aide-images/. Fictitious data only: run against the local server (`pnpm start` on
 * port 3100 with the local providers) after `pnpm db:reset` and the demo visit of step 10
 * (tests/integration/demo-report-visit.test.ts, LOCAL_STORAGE_DIR=.storage/e2e).
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

async function shot(page, name, { fullPage = false } = {}) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
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
