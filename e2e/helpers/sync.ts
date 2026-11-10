import { expect, type Page } from "@playwright/test";

/**
 * Waits until every change of the device has reached the server (indicator count at 0). Since
 * step 12 a change is shown as soon as it is on the device: a test that closes its page right
 * after would lose what is still waiting (each test has its own browser storage).
 */
export async function expectSynced(page: Page, timeout = 30_000) {
  await expect(page.getByTestId("sync-indicator").first()).toHaveAttribute("data-pending", "0", {
    timeout,
  });
}

/**
 * For `test.afterEach` in the serial suites (each test builds on the previous one): the page of
 * the test must not close while its changes are still on the device only.
 */
export async function syncBeforeLeaving(page: Page) {
  if (page.isClosed()) return;
  const indicator = page.getByTestId("sync-indicator").first();
  if ((await indicator.count()) === 0) return;
  await expectSynced(page);
}
