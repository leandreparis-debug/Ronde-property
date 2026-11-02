import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

import { anonymousState, storageStatePath } from "./helpers/auth";

const BLOCKING = new Set(["serious", "critical"]);

async function expectNoBlockingViolation(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter((violation) => BLOCKING.has(violation.impact ?? ""));
  const summary = blocking.map(
    (violation) =>
      `${violation.impact} ${violation.id}: ${violation.help} (${violation.nodes.map((node) => node.target.join(" ")).join(", ")})`,
  );
  expect(summary, summary.join("\n")).toEqual([]);
}

test.describe("as rt", () => {
  for (const path of ["/", "/reserves", "/design", "/compte", "/changer-mot-de-passe"] as const) {
    test(`${path} has no serious or critical axe violation`, async ({ page }) => {
      await page.goto(path);
      await expectNoBlockingViolation(page);
    });
  }

  test("/design at tablet width has no serious or critical axe violation", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/design");
    await expectNoBlockingViolation(page);
  });
});

test.describe("as visitor", () => {
  test.use({ storageState: anonymousState });

  test("/connexion has no serious or critical axe violation", async ({ page }) => {
    await page.goto("/connexion");
    await expectNoBlockingViolation(page);
  });
});

test.describe("as admin", () => {
  test.use({ storageState: storageStatePath("david") });

  for (const path of ["/admin/comptes", "/admin/journal"] as const) {
    test(`${path} has no serious or critical axe violation`, async ({ page }) => {
      await page.goto(path);
      await expectNoBlockingViolation(page);
    });
  }

  test("the account creation dialog has no serious or critical axe violation", async ({ page }) => {
    await page.goto("/admin/comptes");
    await page.getByRole("button", { name: "Nouveau compte" }).click();
    await expect(page.getByRole("dialog", { name: "Nouveau compte" })).toBeVisible();
    await expectNoBlockingViolation(page);
  });
});
