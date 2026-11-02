import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const PAGES = ["/", "/reserves", "/design"] as const;
const BLOCKING = new Set(["serious", "critical"]);

for (const path of PAGES) {
  test(`${path} has no serious or critical axe violation`, async ({ page }) => {
    await page.goto(path);
    const results = await new AxeBuilder({ page }).analyze();
    const blocking = results.violations.filter((violation) => BLOCKING.has(violation.impact ?? ""));
    const summary = blocking.map(
      (violation) =>
        `${violation.impact} ${violation.id}: ${violation.help} (${violation.nodes
          .map((node) => node.target.join(" "))
          .join(", ")})`,
    );
    expect(summary, summary.join("\n")).toEqual([]);
  });
}

test("/design at tablet width has no serious or critical axe violation", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto("/design");
  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter((violation) => BLOCKING.has(violation.impact ?? ""));
  expect(blocking.map((violation) => violation.id)).toEqual([]);
});
