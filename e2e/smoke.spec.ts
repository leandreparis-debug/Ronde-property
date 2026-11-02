import { expect, test } from "@playwright/test";

test("the home page responds", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("h1")).toContainText("RONDE");
});
