/**
 * Screenshots of « Mener la visite sur le plan » (step 12 b) for docs/guide-rt.md, saved in
 * public/aide-images/. Fictitious data only, against the local server (`pnpm start` on port
 * 3100 with the local providers, database `ronde_test`): the script imports the fictitious
 * 3-page plan of the e2e fixtures on TEST-004, assigns its pages (exterior view, « Bâtiment A »
 * RDC and R+1, « Bâtiment B » RDC), traces the outlines, then leads a visit on the tablet.
 *
 *   node scripts/docs/capture-plan-screen.mjs [baseUrl] [extraDir]
 *
 * With `extraDir`, every screenshot is also taken at 768 × 1024 and 1024 × 768 into that
 * directory (review of the step, never committed).
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.join(ROOT, "public", "aide-images");
const BASE = process.argv[2] ?? "http://127.0.0.1:3100";
const EXTRA = process.argv[3] ?? null;
const PASSWORD = "Ronde-test-2026";
const SITE = "TEST-004";
const PDF = path.join(ROOT, "e2e", "fixtures", "plans", "plan-a1-3-pages.pdf");
const PHOTO = path.join(ROOT, "e2e", "fixtures", "images", "exif-orientation-6.jpg");
const PHOTO_2 = path.join(ROOT, "e2e", "fixtures", "images", "gradient.png");

async function signedIn(browser, email, viewport, touch) {
  const context = await browser.newContext({
    baseURL: BASE,
    viewport,
    deviceScaleFactor: 1,
    hasTouch: touch,
    isMobile: touch,
  });
  const page = await context.newPage();
  await page.goto("/connexion");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/connexion"));
  return page;
}

async function settle(page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
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

async function shot(page, name, { guide = true } = {}) {
  await settle(page);
  if (guide) {
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
    console.log(`public/aide-images/${name}.png`);
  }
  if (EXTRA) {
    const size = page.viewportSize();
    await page.screenshot({ path: path.join(EXTRA, `${name}-${size.width}x${size.height}.png`) });
  }
}

async function tapPlan(page, fx, fy) {
  const box = await page.getByTestId("plan-canvas").boundingBox();
  await page.touchscreen.tap(box.x + box.width * fx, box.y + box.height * fy);
}

async function viewLoaded(page) {
  await page.getByTestId("plan-page-image").waitFor();
  await page.waitForFunction(() => {
    const image = document.querySelector("[data-testid=plan-page-image]");
    return image instanceof HTMLImageElement && image.complete;
  });
}

if (EXTRA) await mkdir(EXTRA, { recursive: true });
const browser = await chromium.launch();
try {
  // Configuration of the site on the computer: import, « Affecter les pages », outlines.
  const pc = await signedIn(browser, "rt.alice@example.test", { width: 1280, height: 800 }, false);
  await pc.goto(`/sites/${SITE}`);
  await pc.getByTestId("open-plan-import").click();
  const dialog = pc.getByTestId("import-plan-dialog");
  await dialog.getByTestId("plan-file-input").setInputFiles(PDF);
  await dialog.getByTestId("plan-preview").waitFor({ timeout: 60_000 });
  await dialog.getByTestId("plan-name-input").fill("Plan général (fictif)");
  await dialog.getByTestId("start-plan-import").click();
  const assign = pc.getByTestId("assign-pages-dialog");
  await assign.waitFor({ timeout: 90_000 });
  await assign.getByTestId("assign-target-1").selectOption("exterior");
  for (const [n, building, label] of [
    [2, "Bâtiment A", "RDC"],
    [3, "Bâtiment A", "R+1"],
  ]) {
    await assign.getByTestId(`assign-target-${n}`).selectOption("new");
    await assign.getByTestId(`assign-building-name-${n}`).fill(building);
    await assign.getByTestId(`assign-label-${n}`).fill(label);
  }
  await shot(pc, "site-affecter-pages");
  await assign.getByTestId("assign-submit").click();
  await assign.waitFor({ state: "hidden" });
  // A second building on the same exterior view, from a single-page image.
  await pc.getByTestId("open-plan-import").click();
  await dialog
    .getByTestId("plan-file-input")
    .setInputFiles(path.join(ROOT, "e2e", "fixtures", "plans", "plan-5000x3500.png"));
  await dialog.getByTestId("plan-preview").waitFor({ timeout: 60_000 });
  await dialog.getByTestId("plan-name-input").fill("Bâtiment B (fictif)");
  await dialog.getByTestId("start-plan-import").click();
  await assign.waitFor({ timeout: 90_000 });
  await assign.getByTestId("assign-target-1").selectOption("new");
  await assign.getByTestId("assign-building-name-1").fill("Bâtiment B");
  await assign.getByTestId("assign-label-1").fill("RDC");
  await assign.getByTestId("assign-submit").click();
  await assign.waitFor({ state: "hidden" });
  for (const [building, points] of [
    [
      "Bâtiment A",
      [
        [0.16, 0.27],
        [0.48, 0.27],
        [0.48, 0.6],
        [0.16, 0.6],
      ],
    ],
    [
      "Bâtiment B",
      [
        [0.52, 0.27],
        [0.75, 0.27],
        [0.75, 0.6],
        [0.52, 0.6],
      ],
    ],
  ]) {
    await pc.getByTestId("structure-trace").click();
    const editor = pc.getByTestId("outline-editor");
    await editor.getByTestId("outline-building").selectOption({ label: building });
    await pc.waitForTimeout(500);
    const box = await editor.getByTestId("outline-surface").boundingBox();
    for (const [fx, fy] of points) {
      await pc.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
    }
    if (building === "Bâtiment B") await shot(pc, "site-contour");
    await editor.getByTestId("outline-save").click();
    await editor.waitFor({ state: "hidden" });
  }
  await pc.getByTestId("site-structure").scrollIntoViewIfNeeded();
  await shot(pc, "site-batiments-etages");
  await pc.goto(`/visites/nouvelle?site=${SITE}`);
  await pc.fill("#title", "Visite périodique sur plan (fictive)");
  await pc.getByRole("button", { name: "Créer la visite" }).click();
  await pc.waitForURL(/\/visites\/[0-9a-f-]{36}/);
  const visit = pc.url().split("?")[0].replace(BASE, "");
  await pc.context().close();

  for (const viewport of [
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
  ]) {
    const guide = viewport.width === 768;
    if (!guide && !EXTRA) break;
    const rt = await signedIn(browser, "rt.alice@example.test", viewport, true);
    await rt.goto(`${visit}?onglet=plans`);
    await rt.getByTestId("exterior-building").first().waitFor();
    await viewLoaded(rt);
    if (guide) {
      // Some entries first, so that the counters show.
      await rt.getByTestId("exterior-building").filter({ hasText: "Bâtiment A" }).tap();
      await viewLoaded(rt);
      await tapPlan(rt, 0.3, 0.4);
      await rt.getByTestId("quick-note").tap();
      await rt.getByTestId("note-text").fill("Odeur de gaz près du local de charge");
      await rt.getByTestId("note-save").tap();
      await rt.getByTestId("note-sheet").waitFor({ state: "hidden" });
      await rt.getByTestId("breadcrumb-step").filter({ hasText: "Vue extérieure" }).tap();
      await viewLoaded(rt);
    }
    await shot(rt, "visite-plan-exterieur", { guide });
    await rt.getByTestId("exterior-building").filter({ hasText: "Bâtiment A" }).tap();
    await viewLoaded(rt);
    // Another point in landscape: the portrait run already placed a photo at the first one.
    await (guide ? tapPlan(rt, 0.55, 0.45) : tapPlan(rt, 0.72, 0.62));
    await rt.getByTestId("quick-menu").waitFor();
    await shot(rt, "visite-menu-rapide", { guide });
    const camera = rt.waitForEvent("filechooser");
    await rt.getByTestId("quick-photo").tap();
    await (await camera).setFiles(PHOTO);
    await rt.getByTestId("photo-sheet").waitFor({ timeout: 30_000 });
    await rt.getByTestId("photo-sheet-caption").fill("Butoir du quai 3 fendu");
    await shot(rt, "visite-photo-placee", { guide });
    await rt.getByTestId("photo-sheet-done").tap();
    const shutter = rt.waitForEvent("filechooser");
    await rt.getByTestId("shutter").tap();
    await (await shutter).setFiles(PHOTO_2);
    await rt.getByTestId("open-to-sort").getByTestId("count-badge").waitFor();
    await rt.getByTestId("open-to-sort").tap();
    await rt.getByTestId("to-sort-drawer").waitFor();
    await shot(rt, "visite-a-ranger", { guide });
    await rt.getByRole("button", { name: "Fermer « À ranger »" }).tap();
    await rt.getByTestId("visit-feed-toggle").tap();
    await rt.getByTestId("visit-feed-list").waitFor();
    for (const close of await rt.getByRole("button", { name: "Fermer la notification" }).all()) {
      await close.click().catch(() => undefined);
    }
    await rt.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await shot(rt, "visite-fil", { guide });
    await rt.getByTestId("visit-feed-toggle").tap();
    await rt.getByTestId("account-menu-trigger").filter({ visible: true }).tap();
    await rt.getByTestId("left-handed-toggle").filter({ visible: true }).check();
    await rt.keyboard.press("Escape");
    await rt.getByTestId("plan-screen").scrollIntoViewIfNeeded();
    await shot(rt, "visite-gaucher", { guide });
    await rt.getByTestId("account-menu-trigger").filter({ visible: true }).tap();
    await rt.getByTestId("left-handed-toggle").filter({ visible: true }).uncheck();
    await rt.keyboard.press("Escape");
    await rt.context().close();

    // The direction reads the same plan, without the menu nor the shutter.
    const claire = await signedIn(browser, "direction.claire@example.test", viewport, true);
    await claire.goto(`${visit}?onglet=plans`);
    await claire.getByTestId("exterior-building").filter({ hasText: "Bâtiment A" }).tap();
    await viewLoaded(claire);
    await claire.locator("[data-testid=plan-marker][data-kind=note]").first().tap();
    await claire.getByTestId("note-sheet").waitFor();
    await shot(claire, "visite-plan-lecture-seule", { guide });
    await claire.context().close();
  }
} finally {
  await browser.close();
}
