import path from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect as baseExpect, type Locator, type Page, test } from "@playwright/test";

import { FIXTURE_IMAGES_DIR, FIXTURE_PLANS_DIR } from "./global-setup";
import { storageStatePath } from "./helpers/auth";

test.describe.configure({ mode: "serial" });

// Conversion with pdf.js, direct uploads and server actions on a shared runner.
const expect = baseExpect.configure({ timeout: 30_000 });

const SITE = "TEST-006";
// Unique per run: a retried serial group starts again on a database that already has the plan.
const PLAN_NAME = `Plan de masse e2e ${Date.now().toString(36)}`;
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

/** Opens the Plans tab on the plan, page 2 by default, once hydrated and the image loaded. */
async function openPlan(page: Page, pageNumber = 2) {
  await page.goto(`${visitUrl}?onglet=plans`);
  await expect(page.getByTestId("plans-tab")).toHaveAttribute("data-ready", "true");
  await page.getByRole("button", { name: new RegExp(`Ouvrir le plan.*${PLAN_NAME}`) }).click();
  await expect(page.getByTestId("plan-page-image")).toBeVisible();
  if (pageNumber !== 1) {
    await page.getByTestId("plan-page-select").selectOption(String(pageNumber));
    await expect(page).toHaveURL(new RegExp(`page=${pageNumber}`));
  }
  await expect(page.getByTestId("plan-page-image")).toHaveJSProperty("complete", true);
}

/** Clicks the plan at a fraction of the canvas. */
async function tapCanvas(page: Page, fx: number, fy: number) {
  const box = (await canvas(page).boundingBox())!;
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
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

  test("imports the 3-page PDF from the site page, sees the progress then the plan", async ({
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
  });

  test("places a marker on page 2, links an existing photo and names it", async ({ page }) => {
    await page.goto(`/visites/nouvelle?site=${SITE}`);
    await page.fill("#title", "Visite e2e plans");
    await page.getByRole("button", { name: "Créer la visite" }).click();
    await expect(page).toHaveURL(/\/visites\/[0-9a-f-]{36}/);
    visitUrl = page.url().split("?")[0]!;

    // A photo of the visit to link.
    await page.goto(`${visitUrl}?onglet=photos`);
    await expect(page.getByTestId("photos-tab")).toHaveAttribute("data-ready", "true");
    await page
      .getByTestId("photos-tab")
      .getByTestId("import-input")
      .first()
      .setInputFiles(IMG("shapes.webp"));
    await expect(page.getByTestId("photo-tile")).toHaveCount(1);

    await openPlan(page, 2);
    const fit = Number(await canvas(page).getAttribute("data-fit-scale"));
    await page.getByTestId("zoom-in").click();
    await expect
      .poll(async () => Number(await canvas(page).getAttribute("data-scale")))
      .toBeGreaterThan(fit);
    await page.getByTestId("toggle-place-marker").click();
    await expect(page.getByTestId("place-hint")).toHaveText(
      "Touchez le plan pour placer le repère n° 1",
    );
    await tapCanvas(page, 0.5, 0.5);
    const sheet = page.getByTestId("marker-sheet");
    await expect(sheet).toContainText("Repère n° 1");
    await expect(markers(page)).toHaveCount(1);
    await expect(page.getByTestId("toggle-place-marker")).toHaveAttribute("aria-pressed", "false");

    await sheet.getByTestId("marker-label-input").fill("Butoir quai 14");
    await sheet.getByTestId("marker-photo-choice").first().click();
    await expect(sheet.getByTestId("marker-photo-thumb")).toBeVisible();
    await expect(marker(page, 1)).toHaveAttribute("data-has-photo", "true");
    await expect(page.getByTestId("markers-list")).toContainText("n° 1 · Butoir quai 14");
  });

  test("places a second marker with a photo taken on the spot", async ({ page }) => {
    await openPlan(page, 2);
    await marker(page, 1).click();
    await expect(page.getByTestId("marker-sheet")).toContainText("Repère n° 1");
    // Turning placement on closes the sheet of the previous marker.
    await page.getByTestId("toggle-place-marker").click();
    await expect(page.getByTestId("marker-sheet")).toHaveCount(0);
    await tapCanvas(page, 0.25, 0.3);
    const sheet = page.getByTestId("marker-sheet");
    await expect(sheet).toContainText("Repère n° 2");
    await sheet.getByTestId("marker-photo-input").setInputFiles(IMG("gradient.png"));
    await expect(sheet.getByTestId("marker-photo-thumb")).toBeVisible({ timeout: 60_000 });
    await expect(marker(page, 2)).toHaveAttribute("data-has-photo", "true");
  });

  test("moves marker 1 and finds both positions after a reload, to 0.001", async ({ page }) => {
    await openPlan(page, 2);
    const before = await markerXY(page, 1);
    await page.getByTestId("markers-list-item").first().click();
    await page.getByTestId("marker-move").click();
    await tapCanvas(page, 0.7, 0.65);
    await expect.poll(async () => (await markerXY(page, 1)).x).not.toBeCloseTo(before.x, 2);
    positions[1] = await markerXY(page, 1);
    positions[2] = await markerXY(page, 2);
    await page.reload();
    await expect(page.getByTestId("plan-page-image")).toBeVisible();
    for (const n of [1, 2] as const) {
      const after = await markerXY(page, n);
      expect(Math.abs(after.x - positions[n]!.x)).toBeLessThan(0.001);
      expect(Math.abs(after.y - positions[n]!.y)).toBeLessThan(0.001);
    }
  });

  test("keeps the markers at the same screen size at two zoom levels", async ({ page }) => {
    await openPlan(page, 2);
    const small = (await marker(page, 2).boundingBox())!;
    await page.getByTestId("zoom-in").click();
    await page.getByTestId("zoom-in").click();
    const scaleBefore = Number(await canvas(page).getAttribute("data-fit-scale"));
    await expect
      .poll(async () => Number(await canvas(page).getAttribute("data-scale")))
      .toBeGreaterThan(scaleBefore * 2);
    const large = (await marker(page, 2).boundingBox())!;
    expect(Math.round(large.width)).toBe(Math.round(small.width));
    expect(Math.round(large.height)).toBe(Math.round(small.height));
    await page.getByTestId("zoom-fit").click();
  });

  test("opens a marker, then « Voir la photo » shows the photo viewer with « Repère n° 1 »", async ({
    page,
  }) => {
    await openPlan(page, 2);
    await marker(page, 1).click();
    const sheet = page.getByTestId("marker-sheet");
    await expect(sheet.getByTestId("marker-label-input")).toHaveValue("Butoir quai 14");
    await sheet.getByTestId("marker-view-photo").click();
    await expect(page).toHaveURL(/onglet=photos.*photo=/);
    const viewer = page.getByTestId("photo-viewer");
    await expect(viewer.getByTestId("photo-marker-mention")).toContainText(
      "Repère n° 1 sur Plan de masse e2e",
    );
    await viewer.getByRole("button", { name: "Fermer la visionneuse" }).click();
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
    await openPlan(page, 2);
    await expect(marker(page, 1)).toHaveAttribute("data-has-photo", "false");
    await page.goto(visitUrl);
    await expect(page.getByTestId("incomplete-points")).toContainText("1 repère sans photo");
  });

  test("the Plans tab, the viewer and the marker sheet have no serious or critical axe violation", async ({
    page,
  }) => {
    await page.goto(`${visitUrl}?onglet=plans`);
    await expect(page.getByTestId("plans-tab")).toHaveAttribute("data-ready", "true");
    await expectNoBlockingViolation(page);
    await openPlan(page, 2);
    await expectNoBlockingViolation(page);
    await marker(page, 2).click();
    await expect(page.getByTestId("marker-sheet")).toBeVisible();
    await expectNoBlockingViolation(page);
    await page.goto(`/sites/${SITE}`);
    await expect(page.getByTestId("site-plans")).toBeVisible();
    await expectNoBlockingViolation(page);
  });

  for (const viewport of [
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
    { width: 1280, height: 800 },
  ]) {
    test(`the viewer and the sheet fit ${viewport.width} × ${viewport.height} with 44 px targets`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await openPlan(page, 2);
      await expectNoHorizontalOverflow(page);
      await expectTouchTargets(page, page.getByTestId("plans-tab"));
      await marker(page, 2).click();
      await expect(page.getByTestId("marker-sheet")).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await expectTouchTargets(page, page.getByTestId("marker-sheet"));
    });
  }
});

test.describe("Claire", () => {
  test.use({ storageState: storageStatePath("claire"), viewport: { width: 1280, height: 800 } });

  test("consults the plan and the markers without any editing control", async ({ page }) => {
    await openPlan(page, 2);
    await expect(markers(page)).toHaveCount(2);
    await expect(page.getByTestId("toggle-place-marker")).toHaveCount(0);
    await expect(page.getByTestId("open-plan-import")).toHaveCount(0);
    await page.getByTestId("zoom-in").click();
    await marker(page, 1).click();
    const sheet = page.getByTestId("marker-sheet");
    await expect(sheet).toContainText("Butoir quai 14");
    await expect(sheet.getByTestId("marker-label-input")).toHaveCount(0);
    await expect(sheet.getByTestId("marker-delete")).toHaveCount(0);
    await expect(sheet.getByTestId("marker-move")).toHaveCount(0);
    // A tap on the plan never creates a marker.
    await tapCanvas(page, 0.1, 0.1);
    await expect(markers(page)).toHaveCount(2);
    await page.goto(`/sites/${SITE}`);
    await expect(page.getByTestId("open-plan-import")).toHaveCount(0);
  });
});

test.describe("Alice archives the plan", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("keeps showing it with its markers but refuses new ones", async ({ page }) => {
    await page.goto(`/sites/${SITE}`);
    const plan = page.getByTestId("site-plan").filter({ hasText: PLAN_NAME });
    await plan.getByTestId("archive-plan").click();
    await page.getByTestId("confirm-archive-plan").click();
    await expect(plan.getByTestId("plan-archived")).toBeVisible();
    await openPlan(page, 2);
    await expect(page.getByTestId("plan-viewer-title")).toContainText("Archivé");
    await expect(markers(page)).toHaveCount(2);
    await expect(page.getByTestId("toggle-place-marker")).toHaveCount(0);
    // Existing markers stay editable.
    await marker(page, 2).click();
    await page.getByTestId("marker-label-input").fill("Toujours modifiable");
    await page.getByTestId("marker-label-input").press("Enter");
    await expect(page.getByTestId("markers-list")).toContainText("Toujours modifiable");
  });
});
