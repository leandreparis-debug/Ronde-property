import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Helpers of the offline suites (step 12): synchronisation indicator, panel, local databases
 * of the browser, and the accessibility / layout checks shared with the other suites.
 */

/** The visible synchronisation indicator (side bar on a computer, top bar on a tablet). */
export function indicator(page: Page): Locator {
  return page.getByTestId("sync-indicator").filter({ visible: true });
}

/** Waits for the indicator mood (`asleep`, `attentive`, `happy`, `worried`). */
export async function expectMood(page: Page, mood: string, timeout = 20_000) {
  await expect(indicator(page)).toHaveAttribute("data-mood", mood, { timeout });
}

/** Waits for the number of changes waiting on the device. */
export async function expectPending(page: Page, count: number, timeout = 20_000) {
  await expect(indicator(page)).toHaveAttribute("data-pending", String(count), { timeout });
}

/** Opens the synchronisation panel from the indicator. */
export async function openSyncPanel(page: Page): Promise<Locator> {
  await indicator(page).click();
  const panel = page.getByTestId("sync-panel");
  await expect(panel).toBeVisible();
  return panel;
}

/** Names of the IndexedDB databases of the page's origin. */
export async function localDatabases(page: Page): Promise<string[]> {
  return page.evaluate(async () =>
    (await indexedDB.databases()).map((database) => database.name ?? "").sort(),
  );
}

/** Opens an action of the visit header: inline on a computer, in « Actions » on a tablet. */
export async function visitAction(page: Page, key: string): Promise<Locator> {
  const inline = page.getByTestId("visit-actions").getByTestId(`visit-action-${key}`);
  if (await inline.isVisible()) return inline;
  await page.getByRole("button", { name: "Actions", exact: true }).click();
  return page.getByRole("dialog", { name: "Actions" }).getByTestId(`visit-action-${key}`);
}

/** No serious or critical axe violation on the page (optionally within a part of it). */
export async function expectNoBlockingViolation(page: Page, include?: string) {
  const builder = new AxeBuilder({ page });
  if (include) builder.include(include);
  const results = await builder.analyze();
  const blocking = results.violations.filter((v) =>
    ["serious", "critical"].includes(v.impact ?? ""),
  );
  expect(
    blocking.map((v) => `${v.impact} ${v.id}: ${v.help}`),
    blocking.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`).join("\n"),
  ).toEqual([]);
}

/** Every visible button and link of the scope is at least 44 × 44 px. */
export async function expectTouchTargets(scope: Locator) {
  const tooSmall: string[] = [];
  for (const target of await scope.locator("a, button, [role=radio], [role=switch]").all()) {
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

/** The page does not scroll sideways. */
export async function expectNoHorizontalOverflow(page: Page) {
  const widths = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.client);
}
