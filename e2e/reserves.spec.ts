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

// Server actions, direct uploads and plan conversion on a shared runner.
const expect = baseExpect.configure({ timeout: 30_000 });

const SITE = "TEST-008";
const V1 = "20000000-0000-4000-8000-000000000001";
const R1 = "50000000-0000-4000-8000-000000000001";
// Unique per run: a retried serial group starts again on a database that already has the plan.
const PLAN_NAME = `Plan réserves e2e ${Date.now().toString(36)}`;
const IMG = (name: string) => path.join(FIXTURE_IMAGES_DIR, name);
const PLAN = (name: string) => path.join(FIXTURE_PLANS_DIR, name);
let visitUrl = "";

/** Civil date in Europe/Paris, shifted by a number of days (YYYY-MM-DD). */
function parisDate(offsetDays = 0): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(
    new Date(Date.now() + offsetDays * 86_400_000),
  );
}

const card = (page: Page, text: string | RegExp) =>
  page.getByTestId("reserve-card").filter({ hasText: text });
const sheet = (page: Page) => page.getByTestId("reserve-sheet");

async function expectNoBlockingViolation(page: Page) {
  await expect(page).toHaveTitle(/\S/);
  // Contrast is measured on settled colours, not halfway through an opening animation.
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== "running"),
  );
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

async function expectTouchTargets(scope: Locator) {
  const tooSmall: string[] = [];
  for (const target of await scope.locator("a, button, [role=radio]").all()) {
    if (!(await target.isVisible())) continue;
    const box = await target.boundingBox();
    if (box && (box.width < 44 || box.height < 44)) {
      tooSmall.push(
        `${(await target.innerText()).trim().slice(0, 30)}: ${box.width}×${box.height}`,
      );
    }
  }
  expect(tooSmall, tooSmall.join(", ")).toEqual([]);
}

/** Opens the Reserves tab of the test visit once hydrated. */
async function openTab(page: Page, query = "") {
  await page.goto(`${visitUrl}?onglet=reserves${query}`);
  await expect(page.getByTestId("reserves-tab")).toBeVisible();
  await expect(page.getByTestId("reserves-counters")).toBeVisible();
}

/** Opens the creation sheet with the « Nouvelle réserve » button. */
async function openSheet(page: Page) {
  await page.getByTestId("reserve-new").click();
  await expect(sheet(page)).toBeVisible();
  await expect(page.getByTestId("reserve-action")).toBeFocused();
}

/** Clicks the plan at a fraction of the canvas, after checking nothing covers that point. */
async function tapCanvas(page: Page, fx: number, fy: number) {
  const canvas = page.getByTestId("plan-canvas");
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  const x = box.x + box.width * fx;
  const y = box.y + box.height * fy;
  const inCanvas = await page.evaluate(
    ([px, py]) =>
      Boolean(document.elementFromPoint(px!, py!)?.closest("[data-testid=plan-canvas]")),
    [x, y],
  );
  expect(inCanvas, `point (${x}, ${y}) is covered`).toBe(true);
  await page.mouse.click(x, y);
}

/** Opens the e2e plan in the Plans tab (keeps the other URL parameters). */
async function openPlanFromList(page: Page) {
  await page.getByRole("button", { name: new RegExp(`Ouvrir le plan.*${PLAN_NAME}`) }).click();
  await expect(page.getByTestId("plan-page-image")).toBeVisible();
  await expect(page.getByTestId("plan-page-image")).toHaveJSProperty("complete", true);
}

/** Opens the detail of a reserve from its card. */
async function openDetail(page: Page, text: string) {
  await card(page, text).getByTestId("reserve-card-link").click();
  await expect(page.getByTestId("reserve-detail")).toBeVisible();
}

test.describe("Alice", () => {
  test.use({ storageState: storageStatePath("alice"), viewport: { width: 1280, height: 800 } });

  test("prepares a visit, a plan and a photo on the site", async ({ page }) => {
    await page.goto(`/sites/${SITE}`);
    await page.getByTestId("open-plan-import").click();
    const dialog = page.getByTestId("import-plan-dialog");
    await dialog.getByTestId("plan-file-input").setInputFiles(PLAN("plan-5000x3500.png"));
    await expect(dialog.getByTestId("plan-preview")).toBeVisible();
    await dialog.getByTestId("plan-name-input").fill(PLAN_NAME);
    await dialog.getByTestId("start-plan-import").click();
    await expect(dialog).toHaveCount(0, { timeout: 60_000 });

    await page.goto(`/visites/nouvelle?site=${SITE}`);
    await page.fill("#title", "Visite e2e réserves");
    await page.getByRole("button", { name: "Créer la visite" }).click();
    await expect(page).toHaveURL(/\/visites\/[0-9a-f-]{36}/);
    visitUrl = page.url().split("?")[0]!;

    await page.goto(`${visitUrl}?onglet=photos`);
    await expect(page.getByTestId("photos-tab")).toHaveAttribute("data-ready", "true");
    await page
      .getByTestId("photos-tab")
      .getByTestId("import-input")
      .first()
      .setInputFiles(IMG("shapes.webp"));
    await expect(page.getByTestId("photo-tile")).toHaveCount(1);
    // Step 12: the tile shows as soon as the photo is on the device; wait for the server.
    await expectSynced(page);

    await openTab(page);
    await expect(page.getByText("Aucune réserve, tout est en ordre")).toBeVisible();
  });

  test("creates a reserve with an existing photo in three interactions after « Nouvelle réserve »", async ({
    page,
  }) => {
    await openTab(page);
    await openSheet(page);
    let interactions = 0;
    // 1. Action (the field is focused when the sheet opens).
    await page.keyboard.type("Remplacer le butoir du quai 3");
    interactions += 1;
    // 2. The photo of the visit.
    await page.getByTestId("reserve-photo-choice").first().click();
    interactions += 1;
    // 3. Save.
    await page.getByTestId("reserve-save").click();
    interactions += 1;
    expect(interactions).toBeLessThan(6);
    await expect(sheet(page)).toHaveCount(0);
    const created = card(page, "Remplacer le butoir du quai 3");
    await expect(created).toBeVisible();
    await expect(created).toContainText("R-");
    await expect(created).toContainText("À désigner");
    await expect(created.locator("img")).toHaveCount(1);
    await expect(page.getByTestId("reserves-counters")).toContainText("1 ouverte");
  });

  test("takes a photo from the sheet, linked once uploaded (three interactions)", async ({
    page,
  }) => {
    await openTab(page);
    await openSheet(page);
    let interactions = 0;
    await page.keyboard.type("Reprendre le joint de dilatation");
    interactions += 1;
    await page.getByTestId("reserve-photo-input").setInputFiles(IMG("gradient.png"));
    interactions += 1; // « Prendre une photo » (the camera shot itself happens outside the app)
    await expect(sheet(page).getByText("1 photo choisie.")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("reserve-save")).toBeEnabled();
    await page.getByTestId("reserve-save").click();
    interactions += 1;
    expect(interactions).toBeLessThan(6);
    await expect(card(page, "Reprendre le joint de dilatation").locator("img")).toHaveCount(1);
  });

  test("« Enregistrer et nouvelle » keeps the sheet open, empty and focused", async ({ page }) => {
    await openTab(page);
    await openSheet(page);
    await page.keyboard.type("Nettoyer le caniveau");
    await page.getByTestId("reserve-priority-urgent").click();
    await page.getByTestId("reserve-save-again").click();
    await expect(page.getByTestId("reserve-action")).toHaveValue("");
    await expect(page.getByTestId("reserve-action")).toBeFocused();
    await expect(sheet(page)).toBeVisible();
    await page.keyboard.type("Repeindre le marquage du quai 4");
    await page.getByTestId("reserve-responsible-internal").click();
    await page.getByTestId("reserve-profile-option").filter({ hasText: "Bruno Fictif" }).click();
    await page.getByTestId("reserve-due-15d").click();
    await page.getByTestId("reserve-save").click();
    await expect(sheet(page)).toHaveCount(0);
    await expect(card(page, "Nettoyer le caniveau")).toContainText("Urgente");
    await expect(card(page, "Repeindre le marquage du quai 4")).toContainText("Bruno Fictif");
    await expect(page.getByTestId("reserves-counters")).toContainText("4 ouvertes");
  });

  test("shows the errors under the fields: empty action, invalid e-mail", async ({ page }) => {
    await openTab(page);
    await openSheet(page);
    await page.getByTestId("reserve-save").click();
    await expect(sheet(page).getByText("L'action est obligatoire.")).toBeVisible();
    await page.getByTestId("reserve-action").fill("Resserrer la visserie du bardage");
    await page.getByTestId("reserve-responsible-external").click();
    await page.getByTestId("reserve-company").fill("Bardages Imaginaires SARL");
    await page.getByTestId("reserve-name").fill("Paul Fictif");
    await page.getByTestId("reserve-email").fill("paul@");
    await page.getByTestId("reserve-save").click();
    const email = page.getByTestId("reserve-email");
    await expect(email).toHaveAttribute("aria-invalid", "true");
    await expect(sheet(page).getByText("Adresse e-mail invalide.")).toBeVisible();
    await email.fill("paul@example.test");
    await page.getByTestId("reserve-save").click();
    await expect(sheet(page)).toHaveCount(0);
    const created = card(page, "Resserrer la visserie du bardage");
    await expect(created).toContainText("Paul Fictif · Bardages Imaginaires SARL");
    // The e-mail is never shown in the list, only in the detail.
    await expect(page.getByTestId("reserves-tab")).not.toContainText("paul@example.test");
    await openDetail(page, "Resserrer la visserie du bardage");
    await expect(page.getByTestId("reserve-responsible")).toContainText("paul@example.test");
  });

  test("a past due date asks for a confirmation, then the reserve is overdue in red", async ({
    page,
  }) => {
    await openTab(page);
    await openSheet(page);
    await page.keyboard.type("Remplacer la grille avaloir");
    await page.getByTestId("reserve-due-date").fill(parisDate(-1));
    await page.getByTestId("reserve-save").click();
    await expect(page.getByRole("dialog", { name: "Échéance déjà passée" })).toBeVisible();
    await page.getByTestId("reserve-past-confirm").click();
    await expect(sheet(page)).toHaveCount(0);
    const overdue = card(page, "Remplacer la grille avaloir");
    await expect(overdue).toHaveAttribute("data-overdue", "true");
    await expect(overdue.getByTestId("reserve-overdue")).toHaveText("En retard de 1 j");
    await expect(overdue).toHaveCSS("border-left-width", "4px");
    // Overdue first in the default order.
    await expect(page.getByTestId("reserve-card").first()).toContainText("Remplacer la grille");
  });

  test("closing hides the reserve, « Afficher les levées » shows it dimmed with its closing", async ({
    page,
  }) => {
    await openTab(page);
    await openDetail(page, "Nettoyer le caniveau");
    await page.getByTestId("reserve-close").click();
    await expect(page.getByTestId("reserve-history")).toContainText("Levée par Alice Fictive");
    await openTab(page);
    await expect(card(page, "Nettoyer le caniveau")).toHaveCount(0);
    await expect(page.getByText("1 réserve levée masquée")).toBeVisible();
    await page.getByTestId("reserves-hide-done").uncheck();
    await expect(page).toHaveURL(/levees=afficher/);
    const done = card(page, "Nettoyer le caniveau");
    await expect(done).toHaveAttribute("data-status", "done");
    await expect(done.getByTestId("reserve-closed")).toContainText("par Alice Fictive");
    // Filters live in the URL: a reload keeps them.
    await page.getByTestId("reserves-priority").selectOption("urgent");
    await expect(page).toHaveURL(/priorite=urgent/);
    await page.reload();
    await expect(page.getByTestId("reserves-priority")).toHaveValue("urgent");
    await expect(card(page, "Nettoyer le caniveau")).toBeVisible();
    await expect(page.getByTestId("reserve-card")).toHaveCount(1);
  });

  test("places a reserve on the plan, whose marker opens the reserve", async ({ page }) => {
    await openTab(page);
    await openDetail(page, "Remplacer le butoir du quai 3");
    const code = (await page.getByTestId("reserve-code").innerText()).trim();
    await page.getByTestId("reserve-place").click();
    await expect(page.getByTestId("place-reserve-choose-plan")).toContainText(code);
    await openPlanFromList(page);
    await expect(page.getByTestId("place-reserve-hint")).toHaveText(
      `Touchez le plan pour placer ${code}`,
    );
    await tapCanvas(page, 0.4, 0.45);
    await expect(page.getByTestId("reserve-detail")).toBeVisible();
    await expect(page.getByTestId("reserve-plan-link")).toContainText(PLAN_NAME);
    await page.getByTestId("reserve-plan-link").click();
    const reserveMarker = page.locator(`[data-testid=plan-marker][data-reserve="${code}"]`);
    await expect(reserveMarker).toBeVisible();
    await expect(page.getByTestId("plan-legend")).toContainText("Réserve ouverte ou en retard");
    await expect(page.getByTestId("marker-sheet")).toHaveCount(0);
    await reserveMarker.click();
    await expect(page.getByTestId("reserve-code")).toHaveText(code);
  });

  test("« Créer une réserve ici » turns a plain marker into the reserve's marker", async ({
    page,
  }) => {
    await page.goto(`${visitUrl}?onglet=plans`);
    await expect(page.getByTestId("plans-tab")).toHaveAttribute("data-ready", "true");
    await openPlanFromList(page);
    await page.getByTestId("toggle-place-marker").click();
    await tapCanvas(page, 0.7, 0.6);
    const markerSheet = page.getByTestId("marker-sheet");
    await expect(markerSheet).toBeVisible();
    await markerSheet.getByTestId("marker-create-reserve").click();
    await expect(sheet(page)).toBeVisible();
    await page.getByTestId("reserve-action").fill("Fixer la descente d'eau pluviale");
    await page.getByTestId("reserve-save").click();
    await expect(sheet(page)).toHaveCount(0);
    const created = card(page, "Fixer la descente d'eau pluviale");
    await expect(created.getByText("Placée sur un plan")).toBeAttached();
    const code = (await created.getAttribute("data-code"))!;
    await page.goto(`${visitUrl}?onglet=plans`);
    await openPlanFromList(page);
    await expect(page.locator(`[data-testid=plan-marker][data-reserve="${code}"]`)).toBeVisible();
  });

  test("two devices: the second save shows the conflict without losing its input", async ({
    browser,
  }) => {
    // Step 12: two tabs of one browser share the device copy (no conflict between them); the
    // conflict is between two devices of the same person, hence two browser contexts.
    const context = await browser.newContext({
      storageState: storageStatePath("alice"),
      viewport: { width: 1280, height: 800 },
    });
    const otherDevice = await browser.newContext({
      storageState: storageStatePath("alice"),
      viewport: { width: 1280, height: 800 },
    });
    const first = await context.newPage();
    const second = await otherDevice.newPage();
    for (const page of [first, second]) {
      await openTab(page);
      await openDetail(page, "Repeindre le marquage du quai 4");
      await page.getByRole("button", { name: "Modifier" }).click();
      await expect(sheet(page)).toBeVisible();
    }
    await first.getByTestId("reserve-due-3m").click();
    await first.getByTestId("reserve-save").click();
    await expect(sheet(first)).toHaveCount(0);

    await second.getByTestId("reserve-action").fill("Repeindre le marquage des quais 4 et 5");
    await second.getByTestId("reserve-save").click();
    const conflict = second.getByTestId("reserve-conflict");
    await expect(conflict).toContainText("modifiée entre-temps par Alice Fictive");
    await expect(second.getByTestId("reserve-action")).toHaveValue(
      "Repeindre le marquage des quais 4 et 5",
    );
    await second.getByTestId("reserve-conflict-keep").click();
    await expect(sheet(second)).toHaveCount(0);
    await expect(second.getByTestId("reserve-detail-action")).toHaveText(
      "Repeindre le marquage des quais 4 et 5",
    );
    await expect(second.getByTestId("reserve-history")).toContainText("Échéance :");
    await expect(second.getByTestId("reserve-history")).toContainText("Action :");
    await context.close();
    await otherDevice.close();
  });

  test("deletes the placed reserve after a confirmation naming it; its marker goes too", async ({
    page,
  }) => {
    await openTab(page);
    await openDetail(page, "Remplacer le butoir du quai 3");
    const code = (await page.getByTestId("reserve-code").innerText()).trim();
    await page.getByTestId("reserve-delete").click();
    const dialog = page.getByRole("dialog", { name: `Supprimer ${code} ?` });
    await expect(dialog).toContainText("ainsi que son repère sur le plan");
    await dialog.getByTestId("reserve-delete-confirm").click();
    await expect(page).toHaveURL(/onglet=reserves/);
    await expect(card(page, "Remplacer le butoir du quai 3")).toHaveCount(0);
    await page.goto(`${visitUrl}?onglet=plans`);
    await openPlanFromList(page);
    await expect(page.locator(`[data-testid=plan-marker][data-reserve="${code}"]`)).toHaveCount(0);
  });

  test("links the reserves from Notes, Photos and the incomplete points", async ({ page }) => {
    await page.goto(`${visitUrl}?onglet=photos`);
    await expect(page.getByTestId("photo-reserve-badge").first()).toBeVisible();
    await page.goto(`${visitUrl}?onglet=notes&zone=docks`);
    const zone = page.getByTestId("zone-reserves");
    await expect(zone).toBeVisible();
    await zone.getByTestId("zone-add-reserve").click();
    await expect(sheet(page)).toBeVisible();
    await expect(page.getByTestId("reserve-zone")).toHaveValue("docks");
    await page.getByTestId("reserve-action").fill("Changer le joint du sas du quai 2");
    await page.getByTestId("reserve-save").click();
    await expect(card(page, "Changer le joint du sas du quai 2")).toContainText("Quais");
    await page.goto(`${visitUrl}?onglet=notes&zone=docks`);
    await expect(page.getByTestId("zone-reserves-link")).toHaveText("1 réserve ouverte");
    await page.goto(visitUrl);
    await expect(page.getByTestId("incomplete-points")).toContainText("réserves sans responsable");
    await expect(page.getByTestId("incomplete-points")).toContainText("sans échéance");
  });

  test("the site page lists the open reserves with a link to their visit", async ({ page }) => {
    await page.goto(`/sites/${SITE}`);
    const section = page.getByTestId("site-reserves");
    await expect(section).toBeVisible();
    await expect(page.getByTestId("site-reserves-counters")).toContainText("en retard");
    await expect(section.getByTestId("reserve-card").first()).toContainText("Remplacer la grille");
    await section.getByTestId("site-reserve-visit").first().click();
    await expect(page).toHaveURL(/onglet=reserves/);
  });

  test("passes axe on the tab, the sheet and the detail, with 44 px targets", async ({ page }) => {
    await openTab(page);
    await expectNoBlockingViolation(page);
    await expectTouchTargets(page.getByTestId("reserves-tab"));
    await openSheet(page);
    await expectNoBlockingViolation(page);
    await expectTouchTargets(sheet(page));
    await page.keyboard.press("Escape");
    await openDetail(page, "Remplacer la grille avaloir");
    await expectNoBlockingViolation(page);
    await expectTouchTargets(page.getByTestId("reserve-detail"));
  });
});

test.describe("Alice on a tablet", () => {
  test.use({ storageState: storageStatePath("alice"), viewport: { width: 768, height: 1024 } });

  test("uses the floating button and a full-screen sheet, without horizontal scroll", async ({
    page,
  }) => {
    await openTab(page);
    await expect(page.getByTestId("reserve-new")).toBeHidden();
    await expectNoHorizontalOverflow(page);
    await page.getByTestId("reserve-new-fab").click();
    await expect(sheet(page)).toBeVisible();
    await page.waitForFunction(() =>
      document.getAnimations().every((a) => a.playState !== "running"),
    );
    const box = (await sheet(page).boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(767);
    await expectTouchTargets(sheet(page));
    await page.keyboard.press("Escape");
  });
});

test.describe("V1 seed", () => {
  test.use({ storageState: storageStatePath("alice"), viewport: { width: 1280, height: 800 } });

  test("shows the overdue seed reserve in red with its delay", async ({ page }) => {
    await page.goto(`/visites/${V1}?onglet=reserves`);
    const overdue = page.getByTestId("reserve-card").filter({ hasText: "R-04" });
    await expect(overdue).toHaveAttribute("data-overdue", "true");
    await expect(overdue.getByTestId("reserve-overdue")).toHaveText("En retard de 15 j");
  });
});

test.describe("Claire", () => {
  test.use({ storageState: storageStatePath("claire"), viewport: { width: 1280, height: 800 } });

  test("reads the reserves without any editing control", async ({ page }) => {
    await page.goto(`/visites/${V1}?onglet=reserves`);
    await expect(page.getByTestId("reserves-tab")).toBeVisible();
    await expect(page.getByTestId("reserve-card").first()).toBeVisible();
    await expect(page.getByTestId("reserve-new")).toHaveCount(0);
    await expect(page.getByTestId("reserve-new-fab")).toHaveCount(0);
    await page.goto(`/visites/${V1}/reserves/${R1}`);
    await expect(page.getByTestId("reserve-detail")).toBeVisible();
    await expect(page.getByTestId("reserve-readonly")).toBeVisible();
    await expect(page.getByTestId("reserve-actions")).toHaveCount(0);
    await expect(page.getByTestId("reserve-history")).toContainText("Créée");
    await page.goto(`/sites/TEST-001`);
    await expect(page.getByTestId("site-reserves")).toBeVisible();
    await expectNoBlockingViolation(page);
  });
});
