/**
 * Critère 8 (étape 12 b, « Mener la visite depuis le plan ») :
 * « Sur la tablette, le RT mène la visite depuis le plan du site : il entre dans un bâtiment
 *   depuis la vue extérieure, place une photo en deux touchers (appareil photo compris), en
 *   fait une réserve, pose une note, range une photo prise au déclencheur et retrouve chaque
 *   saisie depuis le fil de visite ; les compteurs suivent. »
 * Le parcours compte les touchers (la saisie au clavier n'en est pas un).
 */
import type { Locator, Page } from "@playwright/test";

import { expect, test } from "../helpers/csp";

import { computerAndTablet, createVisit, IMG, importPlan, PLAN, viewLoaded } from "./helpers";

test.describe.configure({ mode: "serial" });

const RUN = Date.now().toString(36);
const PLAN_NAME = `Plan C8 ${RUN}`;
const BUILDING = `Bât. C8 ${RUN}`;

/** Counts the touches of the journey. */
function touchCounter(page: Page) {
  let count = 0;
  return {
    get count() {
      return count;
    },
    async tap(locator: Locator) {
      count += 1;
      await locator.tap();
    },
    async tapPlan(fx: number, fy: number) {
      count += 1;
      const box = (await page.getByTestId("plan-canvas").boundingBox())!;
      await page.touchscreen.tap(box.x + box.width * fx, box.y + box.height * fy);
    },
  };
}

test("C8 · visite sur plan : vue extérieure, bâtiment, photo en deux touchers, réserve, note, À ranger, fil", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const { computer, tablet } = await computerAndTablet(browser);
  const pc = await computer.newPage();

  // Sur le PC : le plan du site (vue extérieure + deux étages) et le contour du bâtiment.
  await importPlan(pc, "TEST-010", PLAN("plan-a1-3-pages.pdf"), PLAN_NAME, {
    building: BUILDING,
    levels: ["RDC", "R+1"],
    exteriorFirst: true,
  });
  await pc.getByTestId("structure-trace").click();
  const editor = pc.getByTestId("outline-editor");
  await expect(editor).toBeVisible();
  await editor.getByTestId("outline-building").selectOption({ label: BUILDING });
  await pc.waitForTimeout(500); // pop-in animation of the dialog
  const surface = editor.getByTestId("outline-surface");
  const box = (await surface.boundingBox())!;
  for (const [fx, fy] of [
    [0.2, 0.25],
    [0.55, 0.25],
    [0.55, 0.65],
    [0.2, 0.65],
  ] as const) {
    await pc.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
  }
  await expect(surface).toHaveAttribute("data-points", "4");
  await editor.getByTestId("outline-save").click();
  await expect(editor).toHaveCount(0);
  const visitUrl = await createVisit(pc, "TEST-010", "Visite C8 sur plan");
  await computer.close();

  // Sur la tablette : la visite s'ouvre sur la vue extérieure.
  const page = await tablet.newPage();
  const touches = touchCounter(page);
  await page.goto(`${visitUrl}?onglet=plans`);
  await expect(page.getByTestId("plan-screen")).toHaveAttribute("data-ready", "true");
  await expect(page.getByTestId("exterior-outline").first()).toBeAttached();
  const entry = page.locator(`[data-testid=exterior-building][data-name="${BUILDING}"]`);
  await expect(entry).toBeVisible();

  // Un toucher pour entrer dans le bâtiment (premier étage, fil d'Ariane).
  await touches.tap(entry);
  await viewLoaded(page);
  await expect(page.getByTestId("plan-breadcrumb")).toContainText("Vue extérieure");
  await expect(page.getByTestId("plan-breadcrumb")).toContainText(BUILDING);
  await expect(page.getByTestId("breadcrumb-current")).toHaveText("RDC");
  expect(touches.count).toBe(1);

  // Photo placée : toucher le plan, « Photo », l'appareil photo donne l'image.
  let start = touches.count;
  await touches.tapPlan(0.4, 0.45);
  await expect(page.getByTestId("quick-menu")).toBeVisible();
  const camera = page.waitForEvent("filechooser");
  await touches.tap(page.getByTestId("quick-photo"));
  await (await camera).setFiles(IMG("exif-orientation-6.jpg"));
  await expect(page.getByTestId("photo-sheet")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("[data-testid=plan-marker][data-kind=photo]")).toHaveCount(1);
  const photoTouches = touches.count - start;
  expect(photoTouches).toBeLessThanOrEqual(2);

  // … dont il fait une réserve : la photo et le repère suivent.
  await touches.tap(page.getByTestId("photo-make-reserve"));
  const sheet = page.getByTestId("reserve-sheet");
  await expect(sheet).toBeVisible();
  await touches.tap(page.getByTestId("reserve-action"));
  await page.getByTestId("reserve-action").fill("Fuite en toiture");
  await touches.tap(page.getByTestId("reserve-save"));
  await expect(sheet).toHaveCount(0);
  await expect(page.locator("[data-testid=plan-marker][data-reserve]")).toHaveCount(1);
  const reserveTouches = touches.count - start;

  // Une note sur le plan.
  start = touches.count;
  await touches.tapPlan(0.65, 0.3);
  await touches.tap(page.getByTestId("quick-note"));
  await page.getByTestId("note-text").fill("Odeur de gaz près du local de charge");
  await touches.tap(page.getByTestId("note-save"));
  await expect(page.getByTestId("note-sheet")).toHaveCount(0);
  await expect(page.locator("[data-testid=plan-marker][data-kind=note]")).toHaveCount(1);
  const noteTouches = touches.count - start;

  // Une saisie de trop : « Annuler » dans le fil la retire (10 s).
  await touches.tapPlan(0.3, 0.7);
  await touches.tap(page.getByTestId("quick-note"));
  await page.getByTestId("note-text").fill("Note en trop");
  await touches.tap(page.getByTestId("note-save"));
  await expect(page.locator("[data-testid=plan-marker][data-kind=note]")).toHaveCount(2);
  await touches.tap(page.getByTestId("visit-feed-undo"));
  await expect(page.locator("[data-testid=plan-marker][data-kind=note]")).toHaveCount(1);

  // Les compteurs : l'étage, puis le bâtiment sur la vue extérieure.
  await expect(
    page.locator("[data-testid=level-tab][data-label=RDC] [data-testid=count-badge]"),
  ).toHaveAttribute("data-count", "2");
  await touches.tap(page.getByTestId("breadcrumb-step").filter({ hasText: "Vue extérieure" }));
  await expect(entry.getByTestId("count-badge")).toHaveAttribute("data-count", "2");

  // Le déclencheur : une photo « À ranger », placée ensuite sur R+1.
  await touches.tap(entry);
  await viewLoaded(page);
  const shutter = page.waitForEvent("filechooser");
  await touches.tap(page.getByTestId("shutter"));
  await (await shutter).setFiles(IMG("gradient.png"));
  await expect(page.getByTestId("open-to-sort").getByTestId("count-badge")).toHaveAttribute(
    "data-count",
    "1",
    { timeout: 30_000 },
  );
  await touches.tap(page.locator("[data-testid=level-tab][data-label='R+1']"));
  await viewLoaded(page);
  await touches.tap(page.getByTestId("open-to-sort"));
  await touches.tap(page.getByTestId("to-sort-place").first());
  await expect(page.getByTestId("placing-hint")).toBeVisible();
  await touches.tapPlan(0.5, 0.5);
  await expect(page.locator("[data-testid=plan-marker][data-kind=photo]")).toHaveCount(1);
  await expect(page.getByTestId("open-to-sort").getByTestId("count-badge")).toHaveCount(0);

  // Changement d'étage, image déjà chargée.
  const switchStart = Date.now();
  await page.locator("[data-testid=level-tab][data-label=RDC]").tap();
  await viewLoaded(page);
  const switchMs = Date.now() - switchStart;

  // Le fil de visite mène à chaque saisie, quelle que soit la vue.
  await touches.tap(page.getByTestId("visit-feed-toggle"));
  const entries = page.getByTestId("visit-feed-entry");
  await expect(entries.filter({ hasText: "Fuite en toiture" })).toContainText(`${BUILDING} RDC`);
  await touches.tap(page.getByTestId("level-tab").filter({ hasText: "R+1" }));
  await touches.tap(entries.filter({ hasText: "Note · Odeur de gaz" }));
  await expect(page.getByTestId("breadcrumb-current")).toHaveText("RDC");
  await expect(page.getByTestId("note-sheet")).toBeVisible();

  test
    .info()
    .annotations.push(
      { type: "touchers · photo placée", description: String(photoTouches) },
      { type: "touchers · réserve avec photo", description: String(reserveTouches) },
      { type: "touchers · note", description: String(noteTouches) },
      { type: "touchers · parcours complet", description: String(touches.count) },
      { type: "changement d'étage (image en cache)", description: `${switchMs} ms` },
    );
  console.log(
    `C8 mesures : photo ${photoTouches} touchers, réserve avec photo ${reserveTouches}, note ${noteTouches}, parcours ${touches.count}, changement d'étage ${switchMs} ms`,
  );
  expect(switchMs).toBeLessThan(1500);
  await tablet.close();
});
