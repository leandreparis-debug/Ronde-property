import { expect } from "@playwright/test";

import { test } from "./helpers/csp";

import { anonymousState } from "./helpers/auth";

test.describe("SitePicker on /design", () => {
  test.use({ storageState: anonymousState });

  test("works with the keyboard", async ({ page }) => {
    await page.goto("/design#site-picker");
    const input = page.getByRole("combobox", { name: /Site de la visite/ });
    await input.fill("nim");
    const listbox = page.getByRole("listbox", { name: "Sites proposés" });
    await expect(listbox.getByRole("option")).toHaveCount(1);
    await expect(input).toHaveAttribute("aria-expanded", "true");
    await input.press("ArrowDown");
    await expect(input).toHaveAttribute("aria-activedescendant", /listbox-0$/);
    await input.press("Enter");
    await expect(page.getByTestId("site-picker-selected")).toContainText("LOG-204");
    await expect(page.getByTestId("site-picker-value")).toHaveText("Sélection : LOG-204");
    await page.getByRole("button", { name: "Retirer le site sélectionné" }).click();
    await expect(page.getByTestId("site-picker-value")).toHaveText("Aucun site sélectionné.");
  });

  test("works with a click and closes with Escape", async ({ page }) => {
    await page.goto("/design#site-picker");
    const input = page.getByRole("combobox", { name: /Site de la visite/ });
    await input.fill("log");
    const listbox = page.getByRole("listbox", { name: "Sites proposés" });
    await expect(listbox.getByRole("option")).toHaveCount(4);
    await input.press("Escape");
    await expect(input).toHaveAttribute("aria-expanded", "false");
    await input.press("ArrowDown");
    await expect(input).toHaveAttribute("aria-expanded", "true");
    await listbox.getByRole("option", { name: /LOG-310/ }).click();
    await expect(page.getByTestId("site-picker-value")).toHaveText("Sélection : LOG-310");
  });

  test("shows the empty state", async ({ page }) => {
    await page.goto("/design#site-picker");
    const input = page.getByRole("combobox", { name: /Site de la visite/ });
    await input.fill("zzzz");
    await expect(page.getByRole("listbox", { name: "Sites proposés" })).toContainText(
      "Aucun site ne correspond.",
    );
  });
});
