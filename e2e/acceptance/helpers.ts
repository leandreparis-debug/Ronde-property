import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { type Browser, type Download, expect, type Page } from "@playwright/test";

import { FIXTURE_IMAGES_DIR, FIXTURE_PLANS_DIR } from "../global-setup";
import { E2E_BASE_URL, storageStatePath } from "../helpers/auth";

/*
 * Shared steps of the acceptance tests (criteria of the specification, § 14). Each step does
 * what a technical manager does on screen; the assertions read what the screen shows.
 */

export const IMG = (name: string) => path.join(FIXTURE_IMAGES_DIR, name);
export const PLAN = (name: string) => path.join(FIXTURE_PLANS_DIR, name);

/** A computer (1280 × 800) and a touch tablet (768 × 1024) signed in as the same user. */
export async function computerAndTablet(browser: Browser, user: "alice" | "bruno" = "alice") {
  const computer = await browser.newContext({
    baseURL: E2E_BASE_URL,
    storageState: storageStatePath(user),
    viewport: { width: 1280, height: 800 },
  });
  const tablet = await browser.newContext({
    baseURL: E2E_BASE_URL,
    storageState: storageStatePath(user),
    viewport: { width: 768, height: 1024 },
    hasTouch: true,
    isMobile: true,
  });
  return { computer, tablet };
}

/** Creates a visit on a site from the creation form; returns its URL without query. */
export async function createVisit(page: Page, siteCode: string, title: string): Promise<string> {
  await page.goto(`/visites/nouvelle?site=${siteCode}`);
  await expect(page.getByTestId("site-picker-selected")).toContainText(siteCode);
  await page.fill("#title", title);
  await page.getByRole("button", { name: "Créer la visite" }).click();
  await expect(page).toHaveURL(/\/visites\/[0-9a-f-]{36}/);
  return page.url().split("?")[0]!;
}

/** Writes a zone note and waits for the autosave. */
export async function writeNote(page: Page, visitUrl: string, zone: string, text: string) {
  await page.goto(`${visitUrl}?onglet=notes&zone=${zone}`);
  const textarea = page.getByTestId("zone-textarea");
  await textarea.fill(text);
  await expect(page.getByTestId("note-save-status")).toContainText("Enregistré à");
}

/** Creates a reserve from the Reserves tab with the action and an optional priority. */
export async function createReserve(
  page: Page,
  visitUrl: string,
  action: string,
  options: { priority?: "low" | "normal" | "high" | "urgent"; zone?: string } = {},
) {
  await page.goto(`${visitUrl}?onglet=reserves`);
  await expect(page.getByTestId("reserves-counters")).toBeVisible();
  const desktop = page.getByTestId("reserve-new");
  if (await desktop.isVisible()) await desktop.click();
  else await page.getByTestId("reserve-new-fab").click();
  const sheet = page.getByTestId("reserve-sheet");
  await expect(sheet).toBeVisible();
  await page.getByTestId("reserve-action").fill(action);
  if (options.zone) await page.getByTestId("reserve-zone").selectOption(options.zone);
  if (options.priority) await page.getByTestId(`reserve-priority-${options.priority}`).click();
  await page.getByTestId("reserve-save").click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByTestId("reserve-card").filter({ hasText: action })).toBeVisible();
}

/** Adds photos from the Photos tab and waits until they are listed. */
export async function addPhotos(page: Page, visitUrl: string, files: string[], expected: number) {
  await page.goto(`${visitUrl}?onglet=photos`);
  await expect(page.getByTestId("photos-tab")).toHaveAttribute("data-ready", "true");
  const tab = page.getByTestId("photos-tab");
  await expect(tab.locator("[data-testid=photo-picker][data-ready=true]").first()).toBeAttached();
  await tab.getByTestId("import-input").first().setInputFiles(files);
  await expect(page.getByTestId("photo-tile")).toHaveCount(expected, { timeout: 60_000 });
}

/** Where the pages of an imported plan go (« Affecter les pages », step 12 b). */
export interface PlanAssignment {
  /** New building receiving the levels (a unique name keeps the tests independent). */
  building: string;
  /** Labels of the levels, one per page used as a level (« RDC » by default). */
  levels?: string[];
  /** Page 1 becomes the exterior view of the site. */
  exteriorFirst?: boolean;
}

/**
 * Imports a plan on the page of a site (PDF or image) under the given name, then assigns its
 * pages: optionally the exterior view, then the levels of a new building.
 */
export async function importPlan(
  page: Page,
  siteCode: string,
  file: string,
  name: string,
  assignment: PlanAssignment = { building: `Bât. ${name}` },
) {
  await page.goto(`/sites/${siteCode}`);
  await page.getByTestId("open-plan-import").click();
  const dialog = page.getByTestId("import-plan-dialog");
  await dialog.getByTestId("plan-file-input").setInputFiles(file);
  await expect(dialog.getByTestId("plan-preview")).toBeVisible({ timeout: 60_000 });
  await dialog.getByTestId("plan-name-input").fill(name);
  await dialog.getByTestId("start-plan-import").click();
  await expect(dialog).toHaveCount(0, { timeout: 90_000 });
  await assignPages(page, assignment);
}

/** Fills « Affecter les pages » (open after an import) and saves it. */
export async function assignPages(page: Page, assignment: PlanAssignment) {
  const assign = page.getByTestId("assign-pages-dialog");
  await expect(assign).toBeVisible({ timeout: 30_000 });
  const rows = await assign.getByTestId("assign-page").count();
  let level = 0;
  for (let index = 1; index <= rows; index += 1) {
    if (assignment.exteriorFirst && index === 1) {
      await assign.getByTestId(`assign-target-${index}`).selectOption("exterior");
      continue;
    }
    await assign.getByTestId(`assign-target-${index}`).selectOption("new");
    await assign.getByTestId(`assign-building-name-${index}`).fill(assignment.building);
    await assign
      .getByTestId(`assign-label-${index}`)
      .fill(assignment.levels?.[level] ?? (level === 0 ? "RDC" : `R+${level}`));
    level += 1;
  }
  await assign.getByTestId("assign-submit").click();
  await expect(assign).toHaveCount(0, { timeout: 30_000 });
}

/** Waits until the plan screen shows a view with its image loaded. */
export async function viewLoaded(page: Page) {
  await expect(page.getByTestId("plan-page-image")).toBeVisible();
  await expect(page.getByTestId("plan-page-image")).toHaveJSProperty("complete", true);
}

/**
 * Opens a level of a building on the plan screen of a visit (list of the buildings, then the
 * building, then the level tab when it has several), image loaded.
 */
export async function openView(page: Page, visitUrl: string, building: string, level?: string) {
  await page.goto(`${visitUrl}?vue=batiments`);
  await expect(page.getByTestId("plan-screen")).toHaveAttribute("data-ready", "true");
  await page.locator(`[data-testid=building-card][data-name="${building}"]`).click();
  if (level) {
    const tab = page.locator(`[data-testid=level-tab][data-label="${level}"]`);
    if ((await tab.count()) > 0) await tab.click();
  }
  await viewLoaded(page);
}

/** Taps the plan at a fraction of the canvas (touch when the page has touch, else a click). */
export async function tapPlan(page: Page, fx: number, fy: number) {
  const canvas = page.getByTestId("plan-canvas");
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  const x = box.x + box.width * fx;
  const y = box.y + box.height * fy;
  const touch = await page.evaluate(() => navigator.maxTouchPoints > 0);
  if (touch) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

/** Touches a control (tap with touch, click with a mouse). */
export async function touch(page: Page, locator: ReturnType<Page["getByTestId"]>) {
  const hasTouch = await page.evaluate(() => navigator.maxTouchPoints > 0);
  if (hasTouch) await locator.tap();
  else await locator.click();
}

/** Quick menu « Photo » at a point: the camera gives the file, the photo sheet opens. */
export async function addPhotoOnPlan(page: Page, fx: number, fy: number, file: string) {
  await tapPlan(page, fx, fy);
  await expect(page.getByTestId("quick-menu")).toBeVisible();
  const chooser = page.waitForEvent("filechooser");
  await touch(page, page.getByTestId("quick-photo"));
  await (await chooser).setFiles(file);
  await expect(page.getByTestId("photo-sheet")).toBeVisible({ timeout: 30_000 });
}

/** Quick menu « Note » at a point, with its text. */
export async function addNoteOnPlan(page: Page, fx: number, fy: number, text: string) {
  await tapPlan(page, fx, fy);
  await expect(page.getByTestId("quick-menu")).toBeVisible();
  await touch(page, page.getByTestId("quick-note"));
  await page.getByTestId("note-text").fill(text);
  await touch(page, page.getByTestId("note-save"));
  await expect(page.getByTestId("note-sheet")).toHaveCount(0);
}

/** Clicks « Générer le rapport » and waits for the download and the storage. */
export async function generateReport(page: Page, visitUrl: string): Promise<Download> {
  await page.goto(`${visitUrl}?onglet=report`);
  await expect(page.locator("[data-testid=report-tab][data-ready]")).toBeVisible();
  const download = page.waitForEvent("download", { timeout: 120_000 });
  await page.getByTestId("report-generate").click();
  const file = await download;
  await expect(page.getByTestId("report-result")).toBeVisible({ timeout: 120_000 });
  return file;
}

/** Text of a downloaded PDF, page by page (pdf.js in Node). */
export async function pdfText(download: Download): Promise<string[]> {
  const data = new Uint8Array(await readFile(await download.path()));
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const document = await pdfjs.getDocument({ data }).promise;
  const pages: string[] = [];
  for (let index = 1; index <= document.numPages; index += 1) {
    const content = await (await document.getPage(index)).getTextContent();
    pages.push(
      content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ")
        .replace(/\s+/g, " "),
    );
  }
  await document.cleanup();
  return pages;
}

/** SHA-256 of a downloaded file. */
export async function sha256(download: Download): Promise<string> {
  return createHash("sha256")
    .update(await readFile(await download.path()))
    .digest("hex");
}
