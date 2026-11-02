import { expect, test } from "@playwright/test";

import { anonymousState, E2E_BASE_URL, loginAs, storageStatePath } from "./helpers/auth";

test.describe("administration", () => {
  test.use({ storageState: storageStatePath("david") });

  test("creates an account, shows the temporary password once, forces its change, then deactivates it", async ({
    page,
    browser,
  }) => {
    const email = `e2e.${Date.now()}@example.test`;
    await page.goto("/admin/comptes");
    await page.getByRole("button", { name: "Nouveau compte" }).click();
    const dialog = page.getByRole("dialog", { name: "Nouveau compte" });
    await dialog.getByLabel(/^Nom/).fill("Compte E2E");
    await dialog.getByLabel(/^Email/).fill(email);
    await dialog.getByLabel(/^Rôle/).selectOption("rt");
    await dialog.getByRole("button", { name: "Créer le compte" }).click();

    const revealed = page.getByRole("dialog", { name: "Compte créé" });
    await expect(revealed).toBeVisible();
    await expect(revealed.getByText("Il ne sera plus affiché.")).toBeVisible();
    const temporaryPassword =
      (await revealed.getByTestId("temporary-password").textContent())?.trim() ?? "";
    expect(temporaryPassword).toHaveLength(16);
    await revealed.getByRole("button", { name: "J'ai noté le mot de passe" }).click();
    await expect(revealed).toBeHidden();
    await expect(page.getByText(temporaryPassword)).toHaveCount(0);
    await expect(page.getByTestId(`account-${email}`)).toContainText("Actif");

    // The new user signs in with the temporary password and must change it.
    const userContext = await browser.newContext({
      baseURL: E2E_BASE_URL,
      storageState: anonymousState,
    });
    const userPage = await userContext.newPage();
    await loginAs(userPage, email, temporaryPassword);
    await expect(userPage).toHaveURL(/\/changer-mot-de-passe$/);
    await userPage.goto("/reserves");
    await expect(userPage).toHaveURL(/\/changer-mot-de-passe$/);
    await userPage.getByLabel("Mot de passe provisoire").fill(temporaryPassword);
    await userPage.getByLabel("Nouveau mot de passe").fill("Nouveau-mot-de-passe-2026");
    await userPage.getByLabel("Confirmation").fill("Nouveau-mot-de-passe-2026");
    await userPage.getByRole("button", { name: "Enregistrer le nouveau mot de passe" }).click();
    await expect(userPage).toHaveURL(/\/$/);
    await expect(userPage.getByText("Mot de passe modifié").first()).toBeVisible();
    await userPage.goto("/reserves");
    await expect(userPage).toHaveURL(/\/reserves$/);

    // David deactivates the account: the user is signed out at their next request.
    await page.goto("/admin/comptes");
    await page.getByTestId(`account-${email}`).getByRole("button", { name: "Désactiver" }).click();
    const confirm = page.getByRole("dialog", { name: "Désactiver ce compte ?" });
    await confirm.getByRole("button", { name: "Désactiver" }).click();
    await expect(confirm).toBeHidden();
    await expect(page.getByTestId(`account-${email}`)).toContainText("Désactivé");

    await userPage.goto("/");
    await expect(userPage).toHaveURL(/\/connexion/);
    await userContext.close();

    // The journal shows the creation and the sign-ins.
    await page.goto("/admin/journal?action=account.created");
    await expect(page.locator("[data-testid=audit-entry]").first()).toHaveAttribute(
      "data-action",
      "account.created",
    );
    await page.goto("/admin/journal?action=auth.signed_in");
    await expect(page.locator("[data-testid=audit-entry]").first()).toHaveAttribute(
      "data-action",
      "auth.signed_in",
    );
    await page.goto("/admin/journal");
    const entries = page.locator("[data-testid=audit-entry]");
    await expect(entries.getByText("Compte créé").first()).toBeVisible();
    await expect(entries.getByText("Connexion", { exact: true }).first()).toBeVisible();
  });

  test("refuses a duplicate email and self-deactivation in clear text", async ({ page }) => {
    await page.goto("/admin/comptes");
    await page.getByRole("button", { name: "Nouveau compte" }).click();
    const dialog = page.getByRole("dialog", { name: "Nouveau compte" });
    await dialog.getByLabel(/^Nom/).fill("Doublon");
    await dialog.getByLabel(/^Email/).fill("RT.ALICE@example.test");
    await dialog.getByRole("button", { name: "Créer le compte" }).click();
    await expect(dialog.getByRole("alert")).toHaveText("Cette adresse e-mail est déjà utilisée.");
    await page.keyboard.press("Escape");

    await page
      .getByTestId("account-admin.david@example.test")
      .getByRole("button", { name: "Désactiver" })
      .click();
    const confirm = page.getByRole("dialog", { name: "Désactiver ce compte ?" });
    await confirm.getByRole("button", { name: "Désactiver" }).click();
    await expect(confirm.getByRole("alert")).toHaveText(
      "Vous ne pouvez pas désactiver votre propre compte.",
    );
  });

  test("resets a password and shows the new temporary one once", async ({ page }) => {
    await page.goto("/admin/comptes");
    await page
      .getByTestId("account-rt.emma@example.test")
      .getByRole("button", { name: "Réinitialiser le mot de passe" })
      .click();
    const confirm = page.getByRole("dialog", { name: "Réinitialiser le mot de passe ?" });
    await confirm.getByRole("button", { name: "Réinitialiser" }).click();
    const revealed = page.getByRole("dialog", { name: "Mot de passe réinitialisé" });
    await expect(revealed.getByTestId("temporary-password")).toHaveText(/^.{16}$/);
    await revealed.getByRole("button", { name: "J'ai noté le mot de passe" }).click();
    await expect(revealed).toBeHidden();
  });

  test("shows the accounts as cards on a narrow screen", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/admin/comptes");
    await expect(page.locator("table")).toBeHidden();
    await expect(page.getByText("Alice Fictive").filter({ visible: true })).toHaveCount(1);
    await expect(
      page.getByRole("link", { name: "Administration" }).filter({ visible: true }),
    ).toHaveCount(1);
  });
});
