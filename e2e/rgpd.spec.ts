import { readFile } from "node:fs/promises";

import { expect, type Page } from "@playwright/test";

import { anonymousState, E2E_BASE_URL, storageStatePath } from "./helpers/auth";
import { test } from "./helpers/csp";

/* GDPR (step 11): JSON export of an account, anonymisation of a deactivated account. */

test.use({ storageState: storageStatePath("david") });

async function createAccount(page: Page, email: string, fullName: string): Promise<string> {
  await page.goto("/admin/comptes");
  await page.getByRole("button", { name: "Nouveau compte" }).click();
  const dialog = page.getByRole("dialog", { name: "Nouveau compte" });
  await dialog.getByLabel(/^Nom/).fill(fullName);
  await dialog.getByLabel(/^Email/).fill(email);
  await dialog.getByRole("button", { name: "Créer le compte" }).click();
  const revealed = page.getByRole("dialog", { name: "Compte créé" });
  const password = (await revealed.getByTestId("temporary-password").textContent())?.trim() ?? "";
  await revealed.getByRole("button", { name: "J'ai noté le mot de passe" }).click();
  return password;
}

test("exports the data of an account as JSON, without anybody else's e-mail", async ({ page }) => {
  await page.goto("/admin/comptes");
  const download = page.waitForEvent("download");
  await page.getByTestId("account-rt.alice@example.test").getByTestId("account-export").click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^ronde-compte-00000000-\d{4}-\d{2}-\d{2}\.json$/);
  const text = await readFile(await file.path(), "utf8");
  const data = JSON.parse(text) as {
    format: string;
    account: { email: string; fullName: string };
    visits: unknown[];
    reserves: unknown[];
    auditLog: unknown[];
  };
  expect(data.format).toBe("ronde.account-export");
  expect(data.account).toMatchObject({ email: "rt.alice@example.test", fullName: "Alice Fictive" });
  expect(data.visits.length).toBeGreaterThan(0);
  expect(data.reserves.length).toBeGreaterThan(0);
  const emails = new Set(text.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) ?? []);
  expect([...emails]).toEqual(["rt.alice@example.test"]);

  await page.goto("/admin/journal?action=account.exported");
  await expect(page.locator("[data-testid=audit-entry]").first()).toHaveAttribute(
    "data-action",
    "account.exported",
  );
});

test("anonymises a deactivated account after two confirmations, for good", async ({
  page,
  browser,
}) => {
  const email = `e2e.rgpd.${Date.now()}@example.test`;
  const fullName = "Personne À Anonymiser";
  const password = await createAccount(page, email, fullName);
  const row = page.getByTestId(`account-${email}`);

  // Only a deactivated account offers « Anonymiser ».
  await expect(row.getByRole("button", { name: "Anonymiser" })).toHaveCount(0);
  await row.getByRole("button", { name: "Désactiver" }).click();
  await page
    .getByRole("dialog", { name: "Désactiver ce compte ?" })
    .getByRole("button", { name: "Désactiver" })
    .click();
  await expect(row).toContainText("Désactivé");

  await row.getByRole("button", { name: "Anonymiser" }).click();
  const dialog = page.getByRole("dialog", { name: "Anonymiser ce compte ?" });
  await expect(dialog).toContainText("C'est définitif");
  await dialog.getByRole("button", { name: "Continuer" }).click();
  const confirm = dialog.getByRole("button", { name: "Anonymiser définitivement" });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel(/^Nom du compte/).fill("Personne à anonymiser");
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel(/^Nom du compte/).fill(fullName);
  await confirm.click();
  await expect(dialog).toBeHidden();

  await expect(page.getByText(fullName)).toHaveCount(0);
  await expect(page.getByText(email)).toHaveCount(0);
  const anonymised = page.locator("tr", { hasText: "Compte anonymisé" }).filter({
    hasText: "Anonymisé",
  });
  await expect(anonymised.first()).toBeVisible();
  await expect(anonymised.first().getByRole("button")).toHaveCount(0);

  // The former identity cannot sign in anymore.
  const context = await browser.newContext({ baseURL: E2E_BASE_URL, storageState: anonymousState });
  const visitor = await context.newPage();
  await visitor.goto("/connexion");
  await visitor.getByLabel("Email").fill(email);
  await visitor.getByLabel("Mot de passe", { exact: true }).fill(password);
  await visitor.getByRole("button", { name: "Se connecter" }).click();
  await expect(visitor).toHaveURL(/\/connexion/);
  await context.close();

  await page.goto("/admin/journal");
  await expect(
    page.locator("[data-testid=audit-entry]").getByText("Compte anonymisé").first(),
  ).toBeVisible();
});
