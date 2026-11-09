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
