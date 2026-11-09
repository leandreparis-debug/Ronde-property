import { readFile } from "node:fs/promises";

import AxeBuilder from "@axe-core/playwright";
import { expect as baseExpect, type Download, type Locator, type Page } from "@playwright/test";

import { test } from "./helpers/csp";

import { E2E_BASE_URL, storageStatePath } from "./helpers/auth";

test.describe.configure({ mode: "serial" });

// PDF layout in a worker on a shared runner.
const expect = baseExpect.configure({ timeout: 60_000 });

const V1 = "20000000-0000-4000-8000-000000000001";
const SITE = "TEST-011";
let emptyVisitUrl = "";

/** Text of a downloaded PDF, page by page (pdf.js in Node). */
async function pdfPages(download: Download): Promise<string[]> {
  const path = await download.path();
  const data = new Uint8Array(await readFile(path));
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

async function openTab(page: Page, url: string) {
  await page.goto(`${url}?onglet=report`);
  await expect(page.locator("[data-testid=report-tab][data-ready]")).toBeVisible();
}

/** Clicks « Générer le rapport », waits for the download and the end of the storage. */
async function generate(page: Page): Promise<Download> {
  const download = page.waitForEvent("download", { timeout: 120_000 });
  await page.getByTestId("report-generate").click();
  const file = await download;
  await expect(page.getByTestId("report-result")).toBeVisible({ timeout: 120_000 });
  return file;
}

async function expectNoBlockingViolation(page: Page) {
  await page.waitForFunction(() =>
    document.getAnimations().every((animation) => animation.playState !== "running"),
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

async function expectNoHorizontalOverflow(page: Page) {
  const widths = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.client);
}

test.describe("Alice", () => {
  test.use({ storageState: storageStatePath("alice"), viewport: { width: 1280, height: 800 } });

  test("generates the report of V1: progress, download, history with « Brouillon »", async ({
    page,
  }) => {
    await openTab(page, `/visites/${V1}`);
    await expect(page.getByTestId("report-incomplete")).toBeVisible();
    const steps = new Set<string>();
    const watcher = setInterval(() => {
      void page
        .getByTestId("report-step")
        .textContent({ timeout: 50 })
        .then((text) => text && steps.add(text))
        .catch(() => undefined);
    }, 50);
    const file = await generate(page);
    clearInterval(watcher);
    expect(file.suggestedFilename()).toMatch(/^RONDE_TEST-001_\d{4}-\d{2}-\d{2}_\d+\.pdf$/);
    expect([...steps].some((text) => text.startsWith("Chargement des photos"))).toBe(true);
    await expect(page.getByTestId("report-result")).toHaveAttribute("data-mode", "worker");
    // The seed photo has no object in the local storage: the generation goes on.
    await expect(page.getByTestId("report-missing")).toContainText("indisponible");
    const first = page.getByTestId("report-history-item").first();
    await expect(first.getByTestId("report-draft-badge")).toHaveText("Brouillon");

    const pages = await pdfPages(file);
    const text = pages.join("\n");
    expect(pages[0]).toContain("Compte rendu de visite");
    expect(pages[0]).toContain("BROUILLON");
    for (const expected of [
      "Synthèse",
      "Réserves",
      "R-04",
      "En retard de",
      "Notes par zone",
      "Plan A",
    ]) {
      expect(text).toContain(expected);
    }
    expect(pages[1]).toContain(`Page 2 sur ${pages.length}`);
    expect(text).toContain("Photo indisponible");
    expect(text).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
  });

  test("prints a 2-page report for an empty visit, then a final one once the visit is completed", async ({
    page,
  }) => {
    await page.goto(`/visites/nouvelle?site=${SITE}`);
    await page.fill("#title", "Visite e2e rapport vide");
    await page.getByRole("button", { name: "Créer la visite" }).click();
    await expect(page).toHaveURL(/\/visites\/[0-9a-f-]{36}/);
    emptyVisitUrl = page.url().split("?")[0]!;

    await openTab(page, emptyVisitUrl);
    await expect(page.getByText("Aucun rapport généré pour cette visite")).toBeVisible();
    await expectNoBlockingViolation(page);
    const draft = await generate(page);
    const draftPages = await pdfPages(draft);
    expect(draftPages).toHaveLength(2);
    expect(draftPages[1]).toContain("Aucune réserve relevée lors de cette visite.");
    expect(draftPages[1]).toContain("Page 2 sur 2");
    await expect(page.getByTestId("report-draft-badge")).toHaveCount(1);

    await page.goto(emptyVisitUrl);
    const finish = page
      .getByTestId("visit-actions")
      .getByRole("button", { name: "Terminer la visite" });
    await finish.click();
    const dialog = page.getByRole("dialog", { name: "Terminer la visite ?" });
    await dialog.getByRole("button", { name: "Terminer la visite" }).click();
    await expect(page.getByText("Visite terminée").first()).toBeVisible();

    await openTab(page, emptyVisitUrl);
    const final = await generate(page);
    expect(final.suggestedFilename()).toMatch(/_2\.pdf$/);
    const finalPages = await pdfPages(final);
    expect(finalPages[0]).not.toContain("BROUILLON");
    const items = page.getByTestId("report-history-item");
    await expect(items).toHaveCount(2);
    await expect(items.first().getByTestId("report-draft-badge")).toHaveCount(0);
    await expect(items.nth(1).getByTestId("report-draft-badge")).toHaveCount(1);
  });

  test("options: sheet, light quality and 2 photos per page are remembered", async ({ page }) => {
    await openTab(page, `/visites/${V1}`);
    await page.getByTestId("report-open-options").click();
    const sheet = page.getByTestId("report-options");
    await expect(sheet).toBeVisible();
    await expectNoBlockingViolation(page);
    await expectTouchTargets(sheet);
    await page.getByTestId("report-quality-light").click();
    await page.getByTestId("report-per-page-2").click();
    await page.getByTestId("report-section-annex").uncheck();
    await page.getByTestId("report-options-done").click();
    await expect(page.getByTestId("report-options-summary")).toHaveText(
      "Synthèse, Réserves, Notes par zone, Plans · 2 photos/page · Légère",
    );
    await generate(page);
    await openTab(page, `/visites/${V1}`);
    await expect(page.getByTestId("report-options-summary")).toContainText("Légère");
    await expect(page.getByTestId("report-history-item").first()).toContainText("2 photos/page");
    await expectNoBlockingViolation(page);
    await expectTouchTargets(page.getByTestId("report-tab"));
    await expectNoHorizontalOverflow(page);
  });

  test("shows the progress and can cancel before the storage", async ({ browser }) => {
    // Step 12: the service worker serves the fonts from its cache, out of reach of
    // `page.route`; this test needs them slow, hence a context without service worker.
    const context = await browser.newContext({
      baseURL: E2E_BASE_URL,
      storageState: storageStatePath("alice"),
      viewport: { width: 1280, height: 800 },
      serviceWorkers: "block",
    });
    const page = await context.newPage();
    await openTab(page, `/visites/${V1}`);
    // Slow down the fonts of the worker so that the progress stays on screen.
    await page.route("**/fonts/report/**", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.continue();
    });
    await page.getByTestId("report-generate").click();
    await expect(page.getByTestId("report-progress")).toBeVisible();
    await expect(page.getByTestId("report-step")).toHaveText("Mise en page…");
    await expectNoBlockingViolation(page);
    await page.getByTestId("report-cancel").click();
    await expect(page.getByTestId("report-progress")).toHaveCount(0);
    await expect(page.getByText("Génération annulée", { exact: true })).toBeVisible();
    await context.close();
  });
});

test.describe("Claire (direction)", () => {
  test.use({ storageState: storageStatePath("claire"), viewport: { width: 1280, height: 800 } });

  test("generates a report and downloads one from the history", async ({ page }) => {
    await openTab(page, `/visites/${V1}`);
    const file = await generate(page);
    expect(file.suggestedFilename()).toMatch(/^RONDE_TEST-001_/);
    await expect(page.getByTestId("report-history-item").first()).toContainText("Claire Fictive");
    const download = page.waitForEvent("download");
    await page.getByTestId("report-download").first().click();
    expect((await download).suggestedFilename()).toMatch(/^RONDE_TEST-001_.*\.pdf$/);
  });
});

test.describe("tablet", () => {
  test.use({ storageState: storageStatePath("alice"), viewport: { width: 768, height: 1024 } });

  test("lays the tab out without horizontal scroll and with 44 px targets", async ({ page }) => {
    await openTab(page, `/visites/${V1}`);
    await expectNoHorizontalOverflow(page);
    await expectTouchTargets(page.getByTestId("report-tab"));
    await expect(page.getByTestId("report-preview")).toHaveCount(0);
  });
});
