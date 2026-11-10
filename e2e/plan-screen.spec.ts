import { type Browser, type Page } from "@playwright/test";

import {
  createVisit,
  generateReport,
  IMG,
  importPlan,
  PLAN,
  pdfText,
  viewLoaded,
} from "./acceptance/helpers";
import { E2E_BASE_URL, storageStatePath } from "./helpers/auth";
import { expect, test } from "./helpers/csp";
import { expectNoHorizontalOverflow, expectPending, expectTouchTargets } from "./helpers/offline";
import { expectSynced } from "./helpers/sync";

/*
 * Étape 12 b : la visite menée depuis le plan, sur un build de production. Le site TEST-009
 * reçoit un plan de trois pages : vue extérieure, puis « RDC » et « R+1 » d'un bâtiment dont
 * le contour est tracé.
 */

test.describe.configure({ mode: "serial", timeout: 120_000 });

const SITE = "TEST-009";
const RUN = Date.now().toString(36);
const BUILDING = `Bât. plan ${RUN}`;
let visitUrl = "";

async function tablet(browser: Browser, viewport = { width: 768, height: 1024 }) {
  return browser.newContext({
    baseURL: E2E_BASE_URL,
    storageState: storageStatePath("alice"),
    viewport,
    hasTouch: true,
    isMobile: true,
  });
}

/** Taps (touch) or clicks (mouse) the plan at a fraction of the canvas. */
async function tapPlan(page: Page, fx: number, fy: number, mouse = false) {
  const box = (await page.getByTestId("plan-canvas").boundingBox())!;
  const x = box.x + box.width * fx;
  const y = box.y + box.height * fy;
  if (mouse) await page.mouse.click(x, y);
  else await page.touchscreen.tap(x, y);
}

const entry = (page: Page) =>
  page.locator(`[data-testid=exterior-building][data-name="${BUILDING}"]`);

async function waitForServiceWorker(page: Page) {
  const controlled = () =>
    page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      return navigator.serviceWorker.controller !== null;
    });
  if (!(await controlled())) {
    await page.reload();
    await expect.poll(controlled, { timeout: 20_000 }).toBe(true);
  }
}

test("the site gets an exterior view and a building of two levels with its outline", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await importPlan(page, SITE, PLAN("plan-a1-3-pages.pdf"), `Plan écran ${RUN}`, {
    building: BUILDING,
    levels: ["RDC", "R+1"],
    exteriorFirst: true,
  });
  await page.getByTestId("structure-trace").click();
  const editor = page.getByTestId("outline-editor");
  await editor.getByTestId("outline-building").selectOption({ label: BUILDING });
  await page.waitForTimeout(500); // pop-in animation of the dialog
  const box = (await editor.getByTestId("outline-surface").boundingBox())!;
  for (const [fx, fy] of [
    [0.25, 0.3],
    [0.6, 0.3],
    [0.6, 0.7],
    [0.25, 0.7],
  ] as const) {
    await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
  }
  await editor.getByTestId("outline-save").click();
  await expect(editor).toHaveCount(0);
  visitUrl = await createVisit(page, SITE, "Visite e2e sur plan");
});

test("tablet offline: photo placed in two touches, note, shutter; synced, seen on the computer", async ({
  browser,
}) => {
  const context = await tablet(browser);
  const page = await context.newPage();
  await page.goto(`${visitUrl}?onglet=plans`);
  await expect(page.getByTestId("kept-offline-badge")).toBeVisible({ timeout: 20_000 });
  await waitForServiceWorker(page);
  await expect(entry(page)).toBeVisible();

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId("offline-shell")).toBeVisible();
  await expect(entry(page)).toBeVisible();
  await entry(page).tap();
  await viewLoaded(page);

  // Photo placed: tap + « Photo » (the camera gives the file).
  let touches = 0;
  await tapPlan(page, 0.4, 0.45);
  touches += 1;
  const camera = page.waitForEvent("filechooser");
  await page.getByTestId("quick-photo").tap();
  touches += 1;
  await (await camera).setFiles(IMG("exif-orientation-6.jpg"));
  await expect(page.getByTestId("photo-sheet")).toBeVisible({ timeout: 30_000 });
  expect(touches).toBeLessThanOrEqual(2);
  await expect(page.locator("[data-testid=plan-marker][data-kind=photo]")).toHaveCount(1);
  await page.getByTestId("photo-sheet-done").tap();

  await tapPlan(page, 0.65, 0.3);
  await page.getByTestId("quick-note").tap();
  await page.getByTestId("note-text").fill("Note prise hors réseau");
  await page.getByTestId("note-save").tap();
  await expect(page.locator("[data-testid=plan-marker][data-kind=note]")).toHaveCount(1);

  const shutter = page.waitForEvent("filechooser");
  await page.getByTestId("shutter").tap();
  await (await shutter).setFiles(IMG("gradient.png"));
  await expect(page.getByTestId("open-to-sort").getByTestId("count-badge")).toHaveAttribute(
    "data-count",
    "1",
  );
  await expect(
    page.locator("[data-testid=level-tab][data-label=RDC] [data-testid=count-badge]"),
  ).toHaveAttribute("data-count", "2");

  // The feed leads back to the photo from the other level.
  await page.locator("[data-testid=level-tab][data-label='R+1']").tap();
  await viewLoaded(page);
  await page.getByTestId("visit-feed-toggle").tap();
  await page
    .getByTestId("visit-feed-entry")
    .filter({ hasText: /^Photo [•\d]/ })
    .first()
    .tap();
  await expect(page.getByTestId("breadcrumb-current")).toHaveText("RDC");
  await expect(page.getByTestId("marker-sheet")).toBeVisible();

  await context.setOffline(false);
  await expectPending(page, 0, 60_000);
  await expectSynced(page);

  const computer = await browser.newContext({
    baseURL: E2E_BASE_URL,
    storageState: storageStatePath("alice"),
    viewport: { width: 1280, height: 800 },
  });
  const desk = await computer.newPage();
  await desk.goto(`${visitUrl}?vue=batiments`);
  await desk.locator(`[data-testid=building-card][data-name="${BUILDING}"]`).click();
  await viewLoaded(desk);
  await expect(desk.locator("[data-testid=plan-marker][data-kind=photo]")).toHaveCount(1);
  await expect(desk.locator("[data-testid=plan-marker][data-kind=note]")).toHaveCount(1);
  await expect(desk.locator("[data-testid=plan-marker][data-kind=photo]")).toHaveAttribute(
    "data-number",
    /\d+/,
  );
  await expect(desk.getByTestId("open-to-sort").getByTestId("count-badge")).toHaveAttribute(
    "data-count",
    "1",
  );
  await desk.goto(`${visitUrl}?onglet=information`);
  await expect(desk.getByTestId("incomplete-points")).toContainText("1 photo à ranger");
  await computer.close();
  await context.close();
});

test("« Gaucher » moves the thumb controls to the left, without overflow", async ({ browser }) => {
  const context = await tablet(browser);
  const page = await context.newPage();
  await page.goto(`${visitUrl}?onglet=plans`);
  await entry(page).tap();
  await viewLoaded(page);
  const right = (await page.getByTestId("shutter").boundingBox())!;
  expect(right.x).toBeGreaterThan(768 / 2);
  await page.getByTestId("account-menu-trigger").filter({ visible: true }).tap();
  await page.getByTestId("left-handed-toggle").filter({ visible: true }).check();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("plan-screen")).toHaveAttribute("data-thumb-side", "left");
  const left = (await page.getByTestId("shutter").boundingBox())!;
  expect(left.x + left.width).toBeLessThan(768 / 2);
  await expectNoHorizontalOverflow(page);
  // Per device: a reload keeps it.
  await page.reload();
  await expect(page.getByTestId("plan-screen")).toHaveAttribute("data-thumb-side", "left");
  await context.close();
});

test("landscape 1024 × 768: menu inside the plan, 44 px targets, no overflow", async ({
  browser,
}) => {
  const context = await tablet(browser, { width: 1024, height: 768 });
  const page = await context.newPage();
  await page.goto(`${visitUrl}?onglet=plans`);
  await entry(page).tap();
  await viewLoaded(page);
  await tapPlan(page, 0.5, 0.08);
  const menu = page.getByTestId("quick-menu");
  await expect(menu).toBeVisible();
  const canvas = (await page.getByTestId("plan-canvas").boundingBox())!;
  const box = (await menu.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(canvas.y);
  expect(box.x + box.width).toBeLessThanOrEqual(canvas.x + canvas.width);
  for (const choice of ["photo", "reserve", "note"]) {
    const button = (await page.getByTestId(`quick-${choice}`).boundingBox())!;
    expect(button.height).toBeGreaterThanOrEqual(56);
  }
  await page.keyboard.press("Escape");
  await expectNoHorizontalOverflow(page);
  await expectTouchTargets(page.getByTestId("plan-screen"));
  await context.close();
});

test("computer 1280 × 800: a click opens the menu, a note on R+1, the mouse drags a marker", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${visitUrl}?vue=batiments`);
  await page.locator(`[data-testid=building-card][data-name="${BUILDING}"]`).click();
  await page.locator("[data-testid=level-tab][data-label='R+1']").click();
  await viewLoaded(page);
  await tapPlan(page, 0.5, 0.5, true);
  await page.getByTestId("quick-note").click();
  await page.getByTestId("note-text").fill("Note du bureau sur R+1");
  await page.getByTestId("note-save").click();
  const note = page.locator("[data-testid=plan-marker][data-kind=note]");
  await expect(note).toHaveCount(1);
  await expectSynced(page);
  const before = Number(await note.getAttribute("data-x"));
  const box = (await note.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 20, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => Number(await note.getAttribute("data-x"))).toBeGreaterThan(before);
  await expectSynced(page);
});

test("the report prints the exterior view with the outline, then RDC, then R+1", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  const file = await generateReport(page, visitUrl);
  const pages = await pdfText(file);
  const text = pages.join("\n");
  const exterior = text.indexOf("Vue extérieure");
  const rdc = text.indexOf(`${BUILDING} · RDC`);
  const r1 = text.indexOf(`${BUILDING} · R+1`);
  expect(exterior).toBeGreaterThan(-1);
  expect(rdc).toBeGreaterThan(exterior);
  expect(r1).toBeGreaterThan(rdc);
  expect(text).toContain("Note prise hors réseau");
  expect(text).toContain("Note du bureau sur R+1");
});
