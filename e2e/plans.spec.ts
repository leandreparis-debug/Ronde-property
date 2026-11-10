import path from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect as baseExpect, type Locator, type Page } from "@playwright/test";

import { test } from "./helpers/csp";
import { expectSynced, syncBeforeLeaving } from "./helpers/sync";

import { FIXTURE_IMAGES_DIR, FIXTURE_PLANS_DIR } from "./global-setup";
import { storageStatePath } from "./helpers/auth";

test.describe.configure({ mode: "serial" });

// Step 12: a change is shown as soon as it is on the device; the next test (a new browser
// context) only sees what reached the server.
test.afterEach(async ({ page }) => {
  await syncBeforeLeaving(page);
});

// Conversion with pdf.js, direct uploads and server actions on a shared runner.
const expect = baseExpect.configure({ timeout: 30_000 });

const SITE = "TEST-006";
// Unique per run: a retried serial group starts again on a database that already has the plan.
const PLAN_NAME = `Plan de masse e2e ${Date.now().toString(36)}`;
const BUILDING = `Bât. e2e ${Date.now().toString(36)}`;
const PLAN = (name: string) => path.join(FIXTURE_PLANS_DIR, name);
const IMG = (name: string) => path.join(FIXTURE_IMAGES_DIR, name);
let visitUrl = "";
const positions: Record<number, { x: number; y: number }> = {};

const markers = (page: Page) => page.getByTestId("plan-marker");
const marker = (page: Page, n: number) =>
  page.locator(`[data-testid=plan-marker][data-number="${n}"]`);
const canvas = (page: Page) => page.getByTestId("plan-canvas");

async function expectNoBlockingViolation(page: Page) {
  await expect(page).toHaveTitle(/\S/);
  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter((v) =>
    ["serious", "critical"].includes(v.impact ?? ""),
  );
  expect(
    blocking.map((v) => `${v.impact} ${v.id}: ${v.help}`),
    blocking.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`).join("\n"),
  ).toEqual([]);
}

async function expectNoHorizontalOverflow(page: Page) {
  const widths = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.client);
}

async function expectTouchTargets(page: Page, scope: Locator) {
  const tooSmall: string[] = [];
  for (const target of await scope.locator("a, button").all()) {
    if (!(await target.isVisible())) continue;
    if (await target.evaluate((el) => el.getRootNode() !== document)) continue;
    const box = await target.boundingBox();
    if (box && (box.width < 44 || box.height < 44)) {
      tooSmall.push(
        `${(await target.innerText()).trim().slice(0, 30)}: ${box.width}×${box.height}`,
      );
    }
  }
  expect(tooSmall, tooSmall.join(", ")).toEqual([]);
}

/**
 * Opens the plan screen of the visit on a level of the e2e building (« RDC » = page 2 of the
 * PDF by default), from the list of the buildings, image loaded.
 */
async function openPlan(page: Page, level: "RDC" | "R+1" = "RDC") {
  await page.goto(`${visitUrl}?vue=batiments`);
  await expect(page.getByTestId("plan-screen")).toHaveAttribute("data-ready", "true");
  await page.locator(`[data-testid=building-card][data-name="${BUILDING}"]`).click();
  const tab = page.locator(`[data-testid=level-tab][data-label="${level}"]`);
  await expect(tab).toBeVisible();
  if ((await tab.getAttribute("aria-selected")) !== "true") await tab.click();
  await expect(tab).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("plan-page-image")).toBeVisible();
  await expect(page.getByTestId("plan-page-image")).toHaveJSProperty("complete", true);
}

/** Quick menu at a point of the plan, then one of its choices. */
async function quick(page: Page, fx: number, fy: number, choice: "photo" | "reserve" | "note") {
  await tapCanvas(page, fx, fy);
  await expect(page.getByTestId("quick-menu")).toBeVisible();
  await page.getByTestId(`quick-${choice}`).click();
}

/** Clicks the plan at a fraction of the canvas, after checking nothing covers that point. */
async function tapCanvas(page: Page, fx: number, fy: number) {
  await canvas(page).scrollIntoViewIfNeeded();
  const box = (await canvas(page).boundingBox())!;
  const x = box.x + box.width * fx;
  const y = box.y + box.height * fy;
  const hit = await page.evaluate(
    ([px, py]) => {
      const element = document.elementFromPoint(px!, py!);
      const inCanvas = Boolean(element?.closest("[data-testid=plan-canvas]"));
      return {
        inCanvas,
        element: element ? `${element.tagName}.${String(element.className).slice(0, 60)}` : "none",
        viewport: `${window.innerWidth}x${window.innerHeight}`,
      };
    },
    [x, y],
  );
  expect(
    hit.inCanvas,
    `point (${x}, ${y}) covered by ${hit.element} (viewport ${hit.viewport})`,
  ).toBe(true);
  await page.mouse.click(x, y);
}

/** Waits for the sheet of marker `n`, failing with the error shown on screen if any. */
async function expectSheet(page: Page, n: number) {
  const sheet = page.getByTestId("marker-sheet").filter({ hasText: `Repère n° ${n}` });
  const error = page.getByTestId("plan-screen").getByRole("alert").filter({ hasText: /\S/ });
  await expect(sheet.or(error).first()).toBeVisible();
  if (await error.count()) {
    throw new Error(`Repère n° ${n} non créé : ${await error.first().innerText()}`);
  }
  return sheet;
}

async function markerXY(page: Page, n: number) {
  const m = marker(page, n);
  return { x: Number(await m.getAttribute("data-x")), y: Number(await m.getAttribute("data-y")) };
}

test.describe("Alice", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("refuses the 21-page PDF, the corrupted PDF and the fake PDF before any upload", async ({
    page,
  }) => {
    await page.goto(`/sites/${SITE}`);
    await page.getByTestId("open-plan-import").click();
    const dialog = page.getByTestId("import-plan-dialog");
    const cases = [
      ["plan-21-pages.pdf", "Ce PDF dépasse 20 pages."],
      ["plan-corrupted.pdf", "Ce PDF ne peut pas être lu (protégé ou endommagé)."],
      ["fake-plan.pdf", "Format non pris en charge : utilisez un PDF, un PNG ou un JPEG."],
    ] as const;
    for (const [file, message] of cases) {
      await dialog.getByTestId("plan-file-input").setInputFiles(PLAN(file));
      await expect(dialog.getByRole("alert")).toContainText(message);
      await expect(dialog.getByTestId("start-plan-import")).toBeDisabled();
    }
  });

  test("imports the 3-page PDF, assigns its pages (exterior, RDC, R+1) and traces the outline", async ({
    page,
  }) => {
    await page.goto(`/sites/${SITE}`);
    await page.getByTestId("open-plan-import").click();
    const dialog = page.getByTestId("import-plan-dialog");
    await dialog.getByTestId("plan-file-input").setInputFiles(PLAN("plan-a1-3-pages.pdf"));
    await expect(dialog.getByTestId("plan-preview")).toBeVisible();
    await expect(dialog.getByTestId("plan-file-summary")).toContainText("3 pages");
    await expect(dialog.getByTestId("plan-name-input")).toHaveValue("plan-a1-3-pages");
    await dialog.getByTestId("plan-name-input").fill(PLAN_NAME);
    await dialog.getByTestId("start-plan-import").click();
    await expect(dialog.getByTestId("plan-import-progress")).toBeVisible();
    await expect(dialog).toHaveCount(0, { timeout: 60_000 });
    const plan = page.getByTestId("site-plan").filter({ hasText: PLAN_NAME });
    await expect(plan).toContainText("3 pages");

    // « Affecter les pages » opens right after the import.
    const assign = page.getByTestId("assign-pages-dialog");
    await expect(assign).toBeVisible();
    await expect(assign.getByTestId("assign-page")).toHaveCount(3);
    await assign.getByTestId("assign-target-1").selectOption("exterior");
    for (const [n, label] of [
      [2, "RDC"],
      [3, "R+1"],
    ] as const) {
      await assign.getByTestId(`assign-target-${n}`).selectOption("new");
      await assign.getByTestId(`assign-building-name-${n}`).fill(BUILDING);
      await assign.getByTestId(`assign-label-${n}`).fill(label);
    }
    await assign.getByTestId("assign-submit").click();
    await expect(assign).toHaveCount(0);
    const building = page.locator(`[data-testid=structure-building][data-name="${BUILDING}"]`);
    await expect(building).toBeVisible();
    await expect(page.getByTestId("structure-exterior")).toBeVisible();

    // Outline of the building on the exterior view: a self-crossing one is refused.
    await page.getByTestId("structure-trace").click();
    const editor = page.getByTestId("outline-editor");
    await expect(editor).toBeVisible();
    await editor.getByTestId("outline-building").selectOption({ label: BUILDING });
    await page.waitForTimeout(500); // pop-in animation of the dialog
    const surface = editor.getByTestId("outline-surface");
    const box = (await surface.boundingBox())!;
    const click = (fx: number, fy: number) =>
      page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
    for (const [fx, fy] of [
      [0.2, 0.2],
      [0.6, 0.6],
      [0.6, 0.2],
      [0.2, 0.6],
    ] as const) {
      await click(fx, fy);
    }
    await editor.getByTestId("outline-save").click();
    await expect(editor.getByTestId("outline-error")).toContainText("se croise");
    for (let n = 0; n < 4; n += 1) await editor.getByTestId("outline-undo").click();
    await expect(surface).toHaveAttribute("data-points", "0");
    for (const [fx, fy] of [
      [0.2, 0.2],
      [0.6, 0.2],
      [0.6, 0.6],
      [0.2, 0.6],
    ] as const) {
      await click(fx, fy);
    }
    await expect(surface).toHaveAttribute("data-points", "4");
    await editor.getByTestId("outline-save").click();
    await expect(editor).toHaveCount(0);
  });

  test("a pan never opens the menu; a tap does, Escape closes it without creating anything", async ({
    page,
  }) => {
    await page.goto(`/visites/nouvelle?site=${SITE}`);
    await page.fill("#title", "Visite e2e plans");
    await page.getByRole("button", { name: "Créer la visite" }).click();
    await expect(page).toHaveURL(/\/visites\/[0-9a-f-]{36}/);
    visitUrl = page.url().split("?")[0]!;

    // The visit opens on the exterior view: the outline leads into the building.
    await page.goto(`${visitUrl}?onglet=plans`);
    await expect(page.getByTestId("plan-screen")).toHaveAttribute("data-ready", "true");
    await expect(page.getByTestId("exterior-outline")).toHaveCount(1);
    await page.locator(`[data-testid=exterior-building][data-name="${BUILDING}"]`).click();
    await expect(page.getByTestId("breadcrumb-current")).toHaveText("RDC");
    await expect(page.getByTestId("plan-breadcrumb")).toContainText("Vue extérieure");

    await expect(page.getByTestId("plan-page-image")).toHaveJSProperty("complete", true);
    const box = (await canvas(page).boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.5 + 40, box.y + box.height * 0.5 + 30, {
      steps: 5,
    });
    await page.mouse.up();
    await expect(page.getByTestId("quick-menu")).toHaveCount(0);
    await tapCanvas(page, 0.5, 0.5);
    await expect(page.getByTestId("quick-menu")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("quick-menu")).toHaveCount(0);
    await expect(markers(page)).toHaveCount(0);
  });

  test("places a photo with the quick menu, then a note; names the photo marker", async ({
    page,
  }) => {
    await openPlan(page);
    const fit = Number(await canvas(page).getAttribute("data-fit-scale"));
    await page.getByTestId("zoom-in").click();
    await expect
      .poll(async () => Number(await canvas(page).getAttribute("data-scale")))
      .toBeGreaterThan(fit);
    const camera = page.waitForEvent("filechooser");
    await quick(page, 0.5, 0.5, "photo");
    await (await camera).setFiles(IMG("shapes.webp"));
    const photoSheet = page.getByTestId("photo-sheet");
    await expect(photoSheet).toBeVisible();
    await photoSheet.getByTestId("photo-sheet-caption").fill("Butoir quai 14");
    await photoSheet.getByTestId("photo-sheet-done").click();
    await expect(markers(page)).toHaveCount(1);
    await expect(page.locator("[data-testid=plan-marker][data-kind=photo]")).toHaveAttribute(
      "data-has-photo",
      "true",
    );
    await expectSynced(page);
    await expect(marker(page, 1)).toBeVisible();
    await marker(page, 1).click();
    const sheet = await expectSheet(page, 1);
    await sheet.getByTestId("marker-label-input").fill("Butoir quai 14");
    await sheet.getByTestId("marker-label-input").press("Enter");
    await expect(sheet.getByTestId("marker-photo-thumb")).toBeVisible();
    await page.getByRole("button", { name: "Fermer la feuille du repère" }).click();

    await quick(page, 0.25, 0.3, "note");
    await page.getByTestId("note-text").fill("Odeur de gaz près du local de charge");
    await page.getByTestId("note-save").click();
    await expect(page.getByTestId("note-sheet")).toHaveCount(0);
    await expect(page.locator("[data-testid=plan-marker][data-kind=note]")).toHaveCount(1);
    await expect(
      page.locator("[data-testid=level-tab][data-label=RDC] [data-testid=count-badge]"),
    ).toHaveAttribute("data-count", "2");
  });

  test("moves the photo marker and finds both positions after a reload, to 0.001", async ({
    page,
  }) => {
    await openPlan(page);
    const before = await markerXY(page, 1);
    await marker(page, 1).click();
    await page.getByTestId("marker-move").click();
    await expect(page.getByTestId("placing-hint")).toBeVisible();
    await tapCanvas(page, 0.7, 0.65);
    await expect.poll(async () => (await markerXY(page, 1)).x).not.toBeCloseTo(before.x, 2);
    const note = page.locator("[data-testid=plan-marker][data-kind=note]");
    positions[1] = await markerXY(page, 1);
    positions[2] = {
      x: Number(await note.getAttribute("data-x")),
      y: Number(await note.getAttribute("data-y")),
    };
    await expectSynced(page);
    await page.reload();
    await expect(page.getByTestId("plan-page-image")).toBeVisible();
    const after1 = await markerXY(page, 1);
    expect(Math.abs(after1.x - positions[1]!.x)).toBeLessThan(0.001);
    expect(Math.abs(after1.y - positions[1]!.y)).toBeLessThan(0.001);
    expect(Math.abs(Number(await note.getAttribute("data-x")) - positions[2]!.x)).toBeLessThan(
      0.001,
    );
  });

  test("keeps the markers at the same screen size at two zoom levels", async ({ page }) => {
    await openPlan(page);
    const small = (await marker(page, 1).boundingBox())!;
    await page.getByTestId("zoom-in").click();
    await page.getByTestId("zoom-in").click();
    const scaleBefore = Number(await canvas(page).getAttribute("data-fit-scale"));
    await expect
      .poll(async () => Number(await canvas(page).getAttribute("data-scale")))
      .toBeGreaterThan(scaleBefore * 2);
    const large = (await marker(page, 1).boundingBox())!;
    expect(Math.round(large.width)).toBe(Math.round(small.width));
    expect(Math.round(large.height)).toBe(Math.round(small.height));
    await page.getByTestId("zoom-fit").click();
  });

  test("opens a marker, then « Voir la photo » shows the photo viewer with « Repère n° 1 »", async ({
    page,
  }) => {
    await openPlan(page);
    await marker(page, 1).click();
    const sheet = page.getByTestId("marker-sheet");
    await expect(sheet.getByTestId("marker-label-input")).toHaveValue("Butoir quai 14");
    await sheet.getByTestId("marker-view-photo").click();
    await expect(page).toHaveURL(/onglet=photos.*photo=/);
    const viewer = page.getByTestId("photo-viewer");
    await expect(viewer.getByTestId("photo-marker-mention")).toContainText(
      "Repère n° 1 sur Plan de masse e2e",
    );
    // The link back opens the plan screen on that level, centred on the marker.
    await viewer.getByTestId("photo-marker-mention").getByRole("link").click();
    await expect(page.getByTestId("breadcrumb-current")).toHaveText("RDC");
    await expect(page.getByTestId("marker-sheet")).toContainText("Repère n° 1");
    await page.goto(`${visitUrl}?onglet=photos`);
    await expect(page.getByTestId("photo-marker-badge").filter({ hasText: "R1" })).toHaveCount(1);
  });

  test("deleting the linked photo leaves the marker drawn as an outline", async ({ page }) => {
    await page.goto(`${visitUrl}?onglet=photos`);
    await expect(page.getByTestId("photos-tab")).toHaveAttribute("data-ready", "true");
    await page
      .getByTestId("photo-tile")
      .filter({ has: page.getByTestId("photo-marker-badge").filter({ hasText: "R1" }) })
      .click();
    const viewer = page.getByTestId("photo-viewer");
    await viewer.getByTestId("delete-photo").click();
    await expect(page.getByTestId("delete-photo-dialog")).toContainText(
      `Le repère n° 1 sur « ${PLAN_NAME} » restera, sans photo.`,
    );
    await page.getByTestId("confirm-delete-photo").click();
    await expect(page.getByText("Photo supprimée").first()).toBeVisible();
    await openPlan(page);
    await expect(marker(page, 1)).toHaveAttribute("data-has-photo", "false");
    // The note on the plan is not « sans photo »: one marker only is counted.
    await page.goto(`${visitUrl}?onglet=information`);
    await expect(page.getByTestId("incomplete-points")).toContainText("1 repère sans photo");
  });

  test("the plan screen, its menu, sheets and drawer have no serious or critical axe violation", async ({
    page,
  }) => {
    await page.goto(`${visitUrl}?onglet=plans`);
    await expect(page.getByTestId("plan-screen")).toHaveAttribute("data-ready", "true");
    await expectNoBlockingViolation(page);
    await openPlan(page);
    await expectNoBlockingViolation(page);
    await tapCanvas(page, 0.4, 0.4);
    await expect(page.getByTestId("quick-menu")).toBeVisible();
    await expectNoBlockingViolation(page);
    await page.getByTestId("quick-note").click();
    await expect(page.getByTestId("note-sheet")).toBeVisible();
    await expectNoBlockingViolation(page);
    await page.getByRole("button", { name: "Fermer la note" }).click();
    await marker(page, 1).click();
    await expect(page.getByTestId("marker-sheet")).toBeVisible();
    await expectNoBlockingViolation(page);
    await page.getByTestId("open-to-sort").click();
    await expect(page.getByTestId("to-sort-drawer")).toBeVisible();
    await expectNoBlockingViolation(page);
    await page.getByTestId("visit-feed-toggle").click();
    await page.getByTestId("plan-legend-toggle").click();
    await expectNoBlockingViolation(page);
    await page.goto(`${visitUrl}?onglet=information`);
    await expect(page.getByTestId("incomplete-points")).toBeVisible();
    await expectNoBlockingViolation(page);
    await page.goto(`/sites/${SITE}`);
    await expect(page.getByTestId("site-structure")).toBeVisible();
    await expectNoBlockingViolation(page);
  });

  for (const viewport of [
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
    { width: 1280, height: 800 },
  ]) {
    test(`the plan screen and the sheet fit ${viewport.width} × ${viewport.height} with 44 px targets`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await openPlan(page);
      await expectNoHorizontalOverflow(page);
      await expectTouchTargets(page, page.getByTestId("plan-screen"));
      await marker(page, 1).click();
      await expect(page.getByTestId("marker-sheet")).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await expectTouchTargets(page, page.getByTestId("marker-sheet"));
    });
  }
});

test.describe("Claire", () => {
  test.use({ storageState: storageStatePath("claire"), viewport: { width: 1280, height: 800 } });

  test("navigates the plan and reads the markers without any editing control", async ({ page }) => {
    await openPlan(page);
    await expect(markers(page)).toHaveCount(2);
    await expect(page.getByTestId("shutter")).toHaveCount(0);
    await expect(page.getByTestId("plan-zone")).toHaveCount(0);
    await page.getByTestId("zoom-in").click();
    await marker(page, 1).click();
    const sheet = page.getByTestId("marker-sheet");
    await expect(sheet).toContainText("Butoir quai 14");
    await expect(sheet.getByTestId("marker-label-input")).toHaveCount(0);
    await expect(sheet.getByTestId("marker-delete")).toHaveCount(0);
    await expect(sheet.getByTestId("marker-move")).toHaveCount(0);
    await page.getByRole("button", { name: "Fermer la feuille du repère" }).click();
    await page.locator("[data-testid=plan-marker][data-kind=note]").click();
    await expect(page.getByTestId("note-text-readonly")).toContainText("Odeur de gaz");
    await expect(page.getByTestId("note-save")).toHaveCount(0);
    // A tap on the plan never opens the menu nor creates a marker.
    await page.getByRole("button", { name: "Fermer la note" }).click();
    await page.getByTestId("zoom-fit").click();
    await tapCanvas(page, 0.1, 0.1);
    await expect(page.getByTestId("quick-menu")).toHaveCount(0);
    await expect(markers(page)).toHaveCount(2);
    // The breadcrumb still leads to the exterior view.
    await page.getByTestId("breadcrumb-step").filter({ hasText: "Vue extérieure" }).click();
    await expect(page.getByTestId("exterior-outline")).toHaveCount(1);
    await page.goto(`/sites/${SITE}`);
    await expect(page.getByTestId("open-plan-import")).toHaveCount(0);
  });
});

test.describe("Alice archives the plan", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("keeps showing its views with their markers but refuses new ones", async ({ page }) => {
    await page.goto(`/sites/${SITE}`);
    const plan = page.getByTestId("site-plan").filter({ hasText: PLAN_NAME });
    await plan.getByTestId("archive-plan").click();
    await page.getByTestId("confirm-archive-plan").click();
    await expect(plan.getByTestId("plan-archived")).toBeVisible();
    await openPlan(page);
    await expect(page.getByTestId("view-badge")).toBeVisible();
    await expect(markers(page)).toHaveCount(2);
    await tapCanvas(page, 0.1, 0.1);
    await expect(page.getByTestId("quick-menu")).toHaveCount(0);
    // Existing markers stay editable.
    await marker(page, 1).click();
    await page.getByTestId("marker-label-input").fill("Toujours modifiable");
    await page.getByTestId("marker-label-input").press("Enter");
    await expect(page.getByTestId("visit-feed-latest")).toBeVisible();
    await page.getByTestId("visit-feed-toggle").click();
    await expect(page.getByTestId("visit-feed-list")).toContainText("Toujours modifiable");
  });
});
