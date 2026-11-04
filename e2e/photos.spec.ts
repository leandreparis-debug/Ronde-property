import { readFile } from "node:fs/promises";
import path from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect as baseExpect, type Page, test } from "@playwright/test";
import exifr from "exifr";

import { E2E_ENV } from "../playwright.config";

import { FIXTURE_IMAGES_DIR } from "./global-setup";
import { E2E_BASE_URL, storageStatePath } from "./helpers/auth";

test.describe.configure({ mode: "serial" });

// Browser-side compression, direct uploads and server actions on a shared runner.
const expect = baseExpect.configure({ timeout: 20_000 });

const IMG = (name: string) => path.join(FIXTURE_IMAGES_DIR, name);
let visitUrl = "";
let visitId = "";

const tiles = (page: Page) => page.getByTestId("photo-tile");
const counter = (page: Page) => page.getByTestId("photos-tab").getByTestId("photos-counter");
const uploadItems = (page: Page) => page.getByTestId("upload-item");

/** Opens the Photos tab of the visit and waits for it to be hydrated. */
async function openPhotos(page: Page, query = "") {
  await page.goto(`${visitUrl}?onglet=photos${query}`);
  await expect(page.getByTestId("photos-tab")).toHaveAttribute("data-ready", "true");
}

/** Picks files through the hidden « Importer » input of a container, once hydrated. */
async function importFiles(
  page: Page,
  container: ReturnType<Page["getByTestId"]>,
  files: string[],
) {
  await expect(
    container.locator("[data-testid=photo-picker][data-ready=true]").first(),
  ).toBeAttached();
  await container.getByTestId("import-input").first().setInputFiles(files);
}

async function expectNoBlockingViolation(page: Page) {
  // During a client transition Next.js swaps the <head>: axe must not catch an empty title.
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

async function expectTouchTargets(page: Page) {
  const targets = page.locator("a, button, [role='tab']");
  const tooSmall: string[] = [];
  for (const target of await targets.all()) {
    if (!(await target.isVisible())) continue;
    // The Next.js development indicator lives in a shadow root and is absent from the build.
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

/** Waits until every queued upload is done, rejected or failed. */
async function waitForQueue(page: Page, count: number) {
  await expect(uploadItems(page)).toHaveCount(count);
  await expect
    .poll(
      async () =>
        (await uploadItems(page).evaluateAll((items) =>
          items.every((item) =>
            ["done", "rejected", "failed"].includes(item.getAttribute("data-status") ?? ""),
          ),
        )) as boolean,
      { timeout: 60_000 },
    )
    .toBe(true);
}

test.describe("Alice on a laptop", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("imports a JPEG with EXIF, a PNG and a WebP, sees the progress then the thumbnails", async ({
    page,
  }) => {
    await page.goto("/visites/nouvelle?site=TEST-004");
    await page.fill("#title", "Visite e2e photos");
    await page.getByRole("button", { name: "Créer la visite" }).click();
    await expect(page).toHaveURL(/\/visites\/[0-9a-f-]{36}/);
    visitUrl = page.url().split("?")[0]!;
    visitId = visitUrl.split("/").pop()!;

    await page.getByRole("tab", { name: "Photos" }).click();
    await expect(page.getByTestId("photos-tab")).toContainText("Aucune photo pour l'instant");
    await importFiles(page, page.getByTestId("photos-tab"), [
      IMG("exif-orientation-6.jpg"),
      IMG("gradient.png"),
      IMG("shapes.webp"),
    ]);

    // Too fast locally to assert the pill here: it is checked while the storage is cut off.
    await expect(page.getByTestId("upload-queue")).toBeVisible();
    await waitForQueue(page, 3);
    await expect(uploadItems(page).filter({ hasText: "Terminé" })).toHaveCount(3);
    await expect(tiles(page)).toHaveCount(3);
    await expect(counter(page)).toHaveText("3 photos");
    await expect(page.getByTestId("upload-pill")).toHaveCount(0);
    // Every thumbnail is lazy with reserved dimensions.
    for (const img of await tiles(page).locator("img").all()) {
      await expect(img).toHaveAttribute("loading", "lazy");
      await expect(img).toHaveAttribute("width", "400");
      await expect(img).toHaveAttribute("height", "300");
    }
    await expect(page.getByTestId("photos-counter").first()).toContainText("3 photos");
  });

  test("the uploaded JPEG has no EXIF at all (no GPS) and the orientation 6 photo is straight", async ({
    page,
  }) => {
    await openPhotos(page);
    const first = tiles(page).first();
    const photoId = await first.getAttribute("data-photo-id");
    expect(photoId).toMatch(/^[0-9a-f-]{36}$/);
    const file = path.resolve(E2E_ENV.LOCAL_STORAGE_DIR, "visit-photos", visitId, `${photoId}.jpg`);
    const bytes = await readFile(file);
    expect(bytes.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
    const exif = (await exifr.parse(bytes, { gps: true, exif: true, tiff: true })) as
      Record<string, unknown> | undefined;
    expect(exif?.latitude).toBeUndefined();
    expect(exif?.GPSLatitude).toBeUndefined();
    expect(exif?.Orientation).toBeUndefined();

    await first.click();
    const viewer = page.getByTestId("photo-viewer");
    await expect(viewer).toBeVisible();
    // Stored dimensions are those after the rotation: 600 wide, 400 high.
    await expect(viewer.getByTestId("viewer-panel")).toContainText("600 × 400 px");
    await expect(viewer.getByTestId("viewer-panel")).toContainText("Prise le");
    await expect(viewer.getByTestId("viewer-panel")).toContainText("04/05/2026");
    const image = viewer.getByTestId("viewer-image");
    await expect(image).toHaveAttribute("width", "600");
    await expect(image).toHaveAttribute("height", "400");
    const box = await image.boundingBox();
    expect(box!.width).toBeGreaterThan(box!.height);
    await page.keyboard.press("Escape");
    await expect(viewer).toHaveCount(0);
  });

  test("captions a photo, picks a zone and a category, sets the cover, and finds it all after a reload", async ({
    page,
  }) => {
    await openPhotos(page);
    await tiles(page).first().click();
    const viewer = page.getByTestId("photo-viewer");
    await viewer.getByTestId("caption-input").fill("Butoir du quai 14 arraché");
    await expect(viewer.getByTestId("caption-status")).toContainText("Enregistrée");
    await viewer.getByTestId("zone-select").selectOption("docks");
    await expect(viewer.getByTestId("zone-select")).toHaveValue("docks");
    await viewer.getByTestId("category-select").selectOption("defect");
    await expect(viewer.getByTestId("category-select")).toHaveValue("defect");
    // Changing the category must not reset the zone.
    await expect(viewer.getByTestId("zone-select")).toHaveValue("docks");
    await viewer.getByTestId("set-cover").click();
    await expect(viewer.getByTestId("set-cover")).toContainText("Photo de garde");
    await expect(viewer.getByTestId("set-cover")).toBeDisabled();
    // A toast is on top: its own Escape would be consumed first, so close with the button.
    await viewer.getByRole("button", { name: "Fermer la visionneuse" }).click();
    // The open photo is a deep link (`?photo=`): wait until it is dropped before reloading.
    await expect(page).not.toHaveURL(/photo=/);

    await page.reload();
    await expect(tiles(page)).toHaveCount(3);
    const first = tiles(page).first();
    await expect(first.getByTestId("photo-caption")).toHaveText("Butoir du quai 14 arraché");
    await expect(first.getByTestId("photo-zone")).toHaveText("Quais");
    await expect(first.getByTestId("cover-star")).toBeVisible();
    await expect(page.getByTestId("cover-star")).toHaveCount(1);
    await first.click();
    await expect(viewer.getByTestId("category-select")).toHaveValue("defect");
    await expect(viewer.getByTestId("zone-select")).toHaveValue("docks");
    await expect(viewer.getByTestId("caption-input")).toHaveValue("Butoir du quai 14 arraché");
  });

  test("filters « Sans légende », and the incomplete point counts the uncaptioned photos", async ({
    page,
  }) => {
    await openPhotos(page);
    await page.getByTestId("uncaptioned-filter").check();
    await expect(page).toHaveURL(/legende=sans/);
    await expect(tiles(page)).toHaveCount(2);
    await expect(counter(page)).toHaveText("2 sur 3 photos");
    await page.getByTestId("zone-filter").selectOption("docks");
    await expect(tiles(page)).toHaveCount(0);
    await expect(page.getByTestId("photos-tab")).toContainText("Aucune photo pour ces filtres");
    await page.getByTestId("zone-filter").selectOption("");
    await page.getByTestId("uncaptioned-filter").uncheck();
    await expect(tiles(page)).toHaveCount(3);

    await page.goto(visitUrl);
    const points = page.getByTestId("incomplete-points");
    await expect(points).toContainText("2 photos sans légende");
    await points.getByRole("link", { name: "2 photos sans légende" }).click();
    await expect(page).toHaveURL(/onglet=photos&legende=sans/);
    await expect(tiles(page)).toHaveCount(2);
  });

  test("navigates the viewer with the keyboard and deletes a photo after a confirmation", async ({
    page,
  }) => {
    await openPhotos(page);
    await tiles(page).first().click();
    const viewer = page.getByTestId("photo-viewer");
    await expect(viewer).toContainText("1/3");
    await page.keyboard.press("ArrowRight");
    await expect(viewer).toContainText("2/3");
    await expect(page).toHaveURL(/photo=/);
    await page.keyboard.press("ArrowRight");
    await expect(viewer).toContainText("3/3");
    await expect(viewer.getByRole("button", { name: "Photo suivante" })).toBeDisabled();
    await page.keyboard.press("ArrowLeft");
    await expect(viewer).toContainText("2/3");
    await viewer.getByRole("button", { name: "Photo suivante" }).click();
    await expect(viewer).toContainText("3/3");

    await viewer.getByTestId("delete-photo").click();
    const dialog = page.getByTestId("delete-photo-dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Annuler" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(viewer).toContainText("3/3");
    await viewer.getByTestId("delete-photo").click();
    await page.getByTestId("confirm-delete-photo").click();
    await expect(page.getByText("Photo supprimée").first()).toBeVisible();
    await expect(viewer).toContainText("2/2");
    await viewer.getByRole("button", { name: "Fermer la visionneuse" }).click();
    await expect(page).not.toHaveURL(/photo=/);
    await expect(tiles(page)).toHaveCount(2);
    await page.reload();
    await expect(tiles(page)).toHaveCount(2);
    await expect(page.getByTestId("photos-counter").first()).toContainText("2 photos");
  });

  test("refuses the fake JPEG and the HEIC with a message each, and keeps the others going", async ({
    page,
  }) => {
    await openPhotos(page);
    await importFiles(page, page.getByTestId("photos-tab"), [
      IMG("fake.jpg"),
      IMG("fake.heic"),
      IMG("large-4000x3000.jpg"),
    ]);
    await waitForQueue(page, 3);
    const rejected = uploadItems(page).filter({
      hasText: "Format non pris en charge : utilisez JPEG, PNG ou WebP.",
    });
    await expect(rejected).toHaveCount(2);
    await expect(uploadItems(page).filter({ hasText: "Terminé" })).toHaveCount(1);
    await expect(tiles(page)).toHaveCount(3);
    await tiles(page).last().click();
    const viewer = page.getByTestId("photo-viewer");
    await expect(viewer.getByTestId("viewer-panel")).toContainText("1600 × 1200 px");
    const size = await viewer
      .getByTestId("viewer-panel")
      .locator("dd", { hasText: "Ko" })
      .innerText();
    expect(Number(/(\d+) Ko/.exec(size)?.[1])).toBeLessThan(1024);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: /Retirer fake\.jpg/ }).click();
    await page.getByRole("button", { name: /Retirer fake\.heic/ }).click();
    await page.getByRole("button", { name: "Effacer les terminés" }).click();
    await expect(page.getByTestId("upload-queue")).toHaveCount(0);
  });

  test("keeps retrying while the storage is unreachable, then completes the upload", async ({
    page,
  }) => {
    await openPhotos(page);
    await page.route("**/api/local-storage/**", (route) =>
      route.request().method() === "PUT" ? route.abort("connectionfailed") : route.continue(),
    );
    await importFiles(page, page.getByTestId("photos-tab"), [IMG("shapes.webp")]);
    await expect(uploadItems(page).first()).toContainText("Hors connexion : nouvelle tentative…");
    await expect(page.getByTestId("upload-pill")).toContainText("1 envoi en cours");
    await expect(tiles(page)).toHaveCount(3);
    await page.unroute("**/api/local-storage/**");
    await waitForQueue(page, 1);
    await expect(uploadItems(page).first()).toContainText("Terminé");
    await expect(tiles(page)).toHaveCount(4);
    await page.reload();
    await expect(tiles(page)).toHaveCount(4);
  });

  test("adds a photo to a zone from the Notes tab and sees it in the strip", async ({ page }) => {
    await page.goto(`${visitUrl}?onglet=notes&zone=roof`);
    const zonePhotos = page.getByTestId("zone-photos");
    await expect(zonePhotos.getByTestId("zone-photos-count")).toHaveText("0 photo liée");
    await importFiles(page, zonePhotos, [IMG("gradient.png")]);
    await waitForQueue(page, 1);
    await expect(zonePhotos.getByTestId("zone-photos-count")).toHaveText("1 photo liée");
    await expect(zonePhotos.getByTestId("zone-photo-strip").locator("li")).toHaveCount(1);
    await expect(page.getByTestId("zone-item").first()).toContainText("1");
    await zonePhotos.getByTestId("zone-photo-strip").getByRole("button").first().click();
    await expect(page).toHaveURL(/onglet=photos.*photo=/);
    const viewer = page.getByTestId("photo-viewer");
    await expect(viewer).toBeVisible();
    await expect(viewer.getByTestId("zone-select")).toHaveValue("roof");
    await page.keyboard.press("Escape");
    await expect(page).not.toHaveURL(/photo=/);
    await openPhotos(page);
    await expect(tiles(page)).toHaveCount(5);
  });

  test("the Photos tab, the viewer and the queue have no serious or critical axe violation", async ({
    page,
  }) => {
    await openPhotos(page);
    await expect(tiles(page)).toHaveCount(5);
    await expectNoBlockingViolation(page);
    await tiles(page).first().click();
    await expect(page.getByTestId("photo-viewer")).toBeVisible();
    await expectNoBlockingViolation(page);
    await page.keyboard.press("Escape");
    await page.route("**/api/local-storage/**", (route) =>
      route.request().method() === "PUT" ? route.abort("connectionfailed") : route.continue(),
    );
    await importFiles(page, page.getByTestId("photos-tab"), [IMG("shapes.webp")]);
    await expect(uploadItems(page).first()).toContainText("Hors connexion");
    await expectNoBlockingViolation(page);
    await page.getByRole("button", { name: /Retirer shapes\.webp/ }).click();
    await page.unroute("**/api/local-storage/**");
  });

  for (const viewport of [
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
    { width: 1280, height: 800 },
  ]) {
    test(`the grid and the viewer fit ${viewport.width} × ${viewport.height} with 44 px targets`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await openPhotos(page);
      await expect(tiles(page)).toHaveCount(5);
      await expectNoHorizontalOverflow(page);
      await expectTouchTargets(page);
      await tiles(page).first().click();
      await expect(page.getByTestId("photo-viewer")).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await expectTouchTargets(page);
    });
  }
});

test.describe("Claire", () => {
  test.use({ storageState: storageStatePath("claire"), viewport: { width: 1280, height: 800 } });

  test("sees the gallery and the viewer without any control", async ({ page }) => {
    await openPhotos(page);
    await expect(tiles(page)).toHaveCount(5);
    await expect(page.getByTestId("import-photos")).toHaveCount(0);
    await expect(page.getByTestId("take-photo")).toHaveCount(0);
    await expect(page.getByTestId("upload-queue")).toHaveCount(0);
    await tiles(page).first().click();
    const viewer = page.getByTestId("photo-viewer");
    await expect(viewer.getByTestId("viewer-panel")).toContainText("Butoir du quai 14 arraché");
    await expect(viewer.getByTestId("viewer-panel")).toContainText("Désordre");
    await expect(viewer.getByTestId("viewer-panel")).toContainText("Quais");
    await expect(viewer.getByTestId("viewer-panel")).toContainText("Photo de garde");
    await expect(viewer.getByTestId("caption-input")).toHaveCount(0);
    await expect(viewer.getByTestId("delete-photo")).toHaveCount(0);
    await expect(viewer.getByTestId("set-cover")).toHaveCount(0);
    await page.keyboard.press("ArrowRight");
    await expect(viewer).toContainText("2/5");
    await expectNoBlockingViolation(page);
  });

  test("gets no upload URL: the preparation is refused by the RLS", async ({ request }) => {
    // Server actions are not callable directly; the storage route itself refuses an unsigned PUT.
    const response = await request.put(
      `${E2E_BASE_URL}/api/local-storage/visit-photos/${visitId}/forged.jpg?exp=9999999999&max=10&ct=image/jpeg&sig=${"0".repeat(64)}`,
      { data: Buffer.from([0xff, 0xd8, 0xff]), headers: { "Content-Type": "image/jpeg" } },
    );
    expect(response.status()).toBe(403);
  });
});
