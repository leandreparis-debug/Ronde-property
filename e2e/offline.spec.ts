import { type Browser, type Page } from "@playwright/test";

import { createVisit, writeNote } from "./acceptance/helpers";
import {
  anonymousState,
  E2E_BASE_URL,
  loginAs,
  SEED_PASSWORD,
  storageStatePath,
} from "./helpers/auth";
import { expect, test } from "./helpers/csp";
import {
  expectMood,
  expectNoBlockingViolation,
  expectNoHorizontalOverflow,
  expectPending,
  expectTouchTargets,
  indicator,
  localDatabases,
  openSyncPanel,
  visitAction,
} from "./helpers/offline";

/*
 * Étape 12 : hors réseau et synchronisation, sur un build de production avec son service
 * worker. `context.setOffline(true)` coupe aussi le service worker : la page rechargée vient
 * de son cache, les données de IndexedDB.
 */

test.describe.configure({ timeout: 90_000 });

const TABLET = { width: 768, height: 1024 };
const COMPUTER = { width: 1280, height: 800 };

/** A touch tablet (auto-keep) and a computer, signed in as the same seed user. */
async function devices(browser: Browser, user: "alice" | "bruno" = "alice") {
  const tablet = await browser.newContext({
    baseURL: E2E_BASE_URL,
    storageState: storageStatePath(user),
    viewport: TABLET,
    hasTouch: true,
    isMobile: true,
  });
  const computer = await browser.newContext({
    baseURL: E2E_BASE_URL,
    storageState: storageStatePath(user),
    viewport: COMPUTER,
  });
  return { tablet, computer };
}

/**
 * Waits until the service worker is active and controls the page (the offline shell is
 * cached). A page loaded while the worker was still installing is loaded again, online.
 */
async function waitForServiceWorker(page: Page) {
  const controlled = () =>
    page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      return navigator.serviceWorker.controller !== null;
    });
  if (!(await controlled())) {
    await page.reload();
    await expect.poll(controlled, { timeout: 20_000 }).toBe(true);
  }
}

/** Opens a visit on the tablet and waits until it is kept on the device. */
async function openKept(page: Page, visitUrl: string) {
  await page.goto(visitUrl);
  await expect(page.getByTestId("kept-offline-badge")).toBeVisible({ timeout: 20_000 });
  await waitForServiceWorker(page);
}

/** Opens a section of « Liste » (Notes, Réserves, Photos…) from any screen of the visit. */
async function openTab(page: Page, name: string) {
  const section = page.getByRole("tab", { name, exact: true });
  if (!(await section.isVisible())) await page.getByRole("tab", { name: "Liste" }).click();
  await section.click();
}

test("a kept visit reopens offline after a reload, keeps notes and a reserve, then syncs", async ({
  browser,
}) => {
  const { tablet, computer } = await devices(browser);
  const page = await tablet.newPage();
  const visitUrl = await createVisit(page, "TEST-005", "Visite e2e hors réseau");
  await openKept(page, visitUrl);
  await expectMood(page, "happy");

  await tablet.setOffline(true);
  await expect(page.getByTestId("offline-banner")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("offline-shell")).toBeVisible();
  await expect(page).toHaveURL(visitUrl);
  await expect(
    page.getByRole("heading", { level: 1, name: "Visite e2e hors réseau" }),
  ).toBeVisible();
  await expectMood(page, "asleep");

  await openTab(page, "Notes");
  await page.getByTestId("zone-textarea").fill("Toiture vue sans réseau.\n- Lanterneau 2 fissuré");
  await expect(page.getByTestId("note-save-status")).toContainText("Hors réseau");
  await expectPending(page, 1);
  await expect(indicator(page).getByTestId("sync-count")).toHaveText("1");

  await openTab(page, "Réserves");
  await page.getByTestId("reserve-new-fab").click();
  await page.getByTestId("reserve-action").fill("Remplacer le lanterneau 2");
  await page.getByTestId("reserve-save").click();
  const card = page.getByTestId("reserve-card").filter({ hasText: "Remplacer le lanterneau 2" });
  await expect(card).toContainText("R-?");
  await expectPending(page, 2);

  // What needs the server says why.
  await openTab(page, "Plan");
  await expect(page.getByTestId("offline-reason-plan-import")).toBeVisible();
  await openTab(page, "Rapport");
  await expect(page.getByTestId("report-blocked")).toBeVisible();
  await page.getByRole("button", { name: "Actions", exact: true }).click();
  const actions = page.getByRole("dialog", { name: "Actions" });
  for (const key of ["duplicate", "complete", "delete"]) {
    await expect(actions.getByTestId(`visit-action-${key}`)).toBeDisabled();
  }
  await expect(actions).toContainText("demandent le réseau");
  await page.keyboard.press("Escape");

  const panel = await openSyncPanel(page);
  await expect(panel.getByTestId("sync-waiting-item")).toHaveCount(2);
  await expect(panel).toContainText("Gardée sur la tablette");
  await expectNoBlockingViolation(page, "[data-testid=sync-panel]");
  await expectTouchTargets(panel);
  await page.keyboard.press("Escape");
  await expectNoBlockingViolation(page);
  await expectNoHorizontalOverflow(page);

  await openTab(page, "Réserves");
  await tablet.setOffline(false);
  await expectPending(page, 0);
  await expectMood(page, "happy");
  await expect(card).toContainText(/R-\d+/);
  await expect(card).not.toContainText("R-?");

  // The computer sees the work of the tablet.
  const desk = await computer.newPage();
  await desk.goto(`${visitUrl}?onglet=notes&zone=roof`);
  await expect(desk.getByTestId("zone-textarea")).toHaveValue(
    "Toiture vue sans réseau.\n- Lanterneau 2 fissuré",
  );
  await desk.goto(`${visitUrl}?onglet=reserves`);
  await expect(
    desk.getByTestId("reserve-card").filter({ hasText: "Remplacer le lanterneau 2" }),
  ).toBeVisible();
  await tablet.close();
  await computer.close();
});

test("the indicator shows its four moods and the count", async ({ browser }) => {
  const { tablet, computer } = await devices(browser);
  const page = await tablet.newPage();
  const visitUrl = await createVisit(page, "TEST-007", "Visite e2e indicateur");
  await openKept(page, visitUrl);
  await expectMood(page, "happy");
  await expect(indicator(page).getByTestId("sync-count")).toHaveCount(0);
  await expectTouchTargets(page.getByRole("banner"));

  // Asleep: offline, with the changes waiting.
  await page.goto(`${visitUrl}?onglet=notes&zone=docks`);
  await tablet.setOffline(true);
  await page.getByTestId("zone-textarea").fill("Quai 3 : butoir à reprendre.");
  await expectMood(page, "asleep");
  await expectPending(page, 1);
  await expect(indicator(page).getByTestId("sync-count")).toHaveText("1");

  // Attentive: the network is back, the answer is slow.
  await page.route("**/api/sync", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 3_000));
    await route.continue();
  });
  await tablet.setOffline(false);
  await expectMood(page, "attentive", 5_000);
  await expectMood(page, "happy");
  await expectPending(page, 0);
  await page.unroute("**/api/sync");

  // Worried: a conflict to arbitrate (the computer saved the same zone meanwhile).
  await tablet.setOffline(true);
  await page.getByTestId("zone-textarea").fill("Quai 3 : butoir remplacé (tablette).");
  await expectPending(page, 1);
  const desk = await computer.newPage();
  await writeNote(desk, visitUrl, "docks", "Quai 3 : butoir remplacé (PC).");
  await openTab(page, "Informations");
  await tablet.setOffline(false);
  await expectMood(page, "worried");
  await expect(indicator(page).getByTestId("sync-count")).toHaveText("1");
  await expect(indicator(page)).toHaveAccessibleName(/1 conflit à arbitrer/);
  await tablet.close();
  await computer.close();
});

test("a note changed on both devices is arbitrated from « À arbitrer » with « Fusionner »", async ({
  browser,
}) => {
  const { tablet, computer } = await devices(browser);
  const desk = await computer.newPage();
  const visitUrl = await createVisit(desk, "TEST-009", "Visite e2e arbitrage");
  const page = await tablet.newPage();
  await openKept(page, visitUrl);

  await page.goto(`${visitUrl}?onglet=notes&zone=roof`);
  await tablet.setOffline(true);
  await page.getByTestId("zone-textarea").fill("Constat tablette : lanterneau 4 cassé.");
  await expectPending(page, 1);
  await openTab(page, "Informations");

  await writeNote(desk, visitUrl, "roof", "Constat PC : étanchéité correcte.");

  await tablet.setOffline(false);
  await expectMood(page, "worried");
  const panel = await openSyncPanel(page);
  await expect(panel.getByTestId("sync-conflicts")).toContainText("Toiture");
  await panel.getByTestId("sync-arbitrate").first().click();
  const dialog = page.getByTestId("arbitration-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId("arbitration-mine")).toContainText("Constat tablette");
  await expect(dialog.getByTestId("arbitration-theirs")).toContainText("Constat PC");
  await expect(dialog.getByTestId("arbitration-mine-keep")).toHaveText("Garder la mienne");
  await expect(dialog.getByTestId("arbitration-theirs-keep")).toHaveText("Garder celle du serveur");
  await expectNoBlockingViolation(page, "[data-testid=arbitration-dialog]");
  await expectTouchTargets(dialog);

  await dialog.getByTestId("arbitration-merge").click();
  const merged = dialog.getByTestId("arbitration-merge-text");
  await expect(merged).toHaveValue(
    "Constat PC : étanchéité correcte.\n\nConstat tablette : lanterneau 4 cassé.",
  );
  await merged.fill("Étanchéité correcte, sauf le lanterneau 4 (cassé).");
  await dialog.getByTestId("arbitration-merge-save").click();
  await expect(dialog).toBeHidden();
  await expectPending(page, 0);
  await expectMood(page, "happy");

  await desk.goto(`${visitUrl}?onglet=notes&zone=roof`);
  await expect(desk.getByTestId("zone-textarea")).toHaveValue(
    "Étanchéité correcte, sauf le lanterneau 4 (cassé).",
  );
  await tablet.close();
  await computer.close();
});

test("a visit completed on the computer meanwhile: the change is refused, its text can be copied", async ({
  browser,
}) => {
  const { tablet, computer } = await devices(browser);
  await tablet.grantPermissions(["clipboard-read", "clipboard-write"], { origin: E2E_BASE_URL });
  const desk = await computer.newPage();
  const visitUrl = await createVisit(desk, "TEST-010", "Visite e2e terminée entre-temps");
  const page = await tablet.newPage();
  await openKept(page, visitUrl);

  await page.goto(`${visitUrl}?onglet=notes&zone=roof`);
  await tablet.setOffline(true);
  await page.getByTestId("zone-textarea").fill("Texte saisi pendant que le PC terminait.");
  await expectPending(page, 1);

  await desk.goto(visitUrl);
  await (await visitAction(desk, "complete")).click();
  const confirm = desk.getByRole("dialog", { name: "Terminer la visite ?" });
  await confirm.getByRole("button", { name: "Terminer la visite" }).click();
  await expect(desk.getByTestId("visit-banner")).toContainText("Visite terminée le");

  await tablet.setOffline(false);
  await expectMood(page, "worried");
  const panel = await openSyncPanel(page);
  const refused = panel.getByTestId("sync-rejected-item");
  await expect(refused).toHaveCount(1);
  await expect(refused).toContainText("La visite a été terminée entre-temps");
  await expect(refused).toContainText("Texte saisi pendant que le PC terminait.");
  await refused.getByTestId("sync-copy-text").click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "Texte saisi pendant que le PC terminait.",
  );
  await expectNoBlockingViolation(page, "[data-testid=sync-panel]");
  await tablet.close();
  await computer.close();
});

test("« Garder hors réseau » shows the size, marks the visit, and « Ne plus garder » removes it", async ({
  browser,
}) => {
  const computer = await browser.newContext({
    baseURL: E2E_BASE_URL,
    storageState: storageStatePath("alice"),
    viewport: COMPUTER,
  });
  const page = await computer.newPage();
  const visitUrl = await createVisit(page, "TEST-003", "Visite e2e gardée");
  // A computer does not keep the visits by itself.
  await expect(page.getByTestId("kept-offline-badge")).toHaveCount(0);

  await (await visitAction(page, "keep")).click();
  const dialog = page.getByTestId("keep-offline-dialog");
  await expect(dialog.getByTestId("keep-offline-size")).toContainText(/\d+(,\d+)? (o|Ko|Mo)/);
  await expectNoBlockingViolation(page, "[data-testid=keep-offline-dialog]");
  await expectTouchTargets(dialog);
  await dialog.getByTestId("keep-offline-start").click();
  await expect(page.getByTestId("kept-offline-badge")).toBeVisible({ timeout: 20_000 });

  await page.goto("/");
  const listed = page.getByTestId(`visit-${visitUrl.split("/").pop()}`);
  await expect(listed.getByTestId("kept-offline-badge")).toHaveText(/Disponible hors réseau/);
  await page.getByTestId("account-menu-trigger").filter({ visible: true }).click();
  await expect(page.getByTestId("storage-usage").filter({ visible: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expectNoHorizontalOverflow(page);

  await page.goto(visitUrl);
  await (await visitAction(page, "keep")).click();
  await page.getByTestId("unkeep-offline").click();
  await page.waitForLoadState();
  await expect(page.getByTestId("kept-offline-badge")).toHaveCount(0);
  await computer.close();
});

/** Creates an account from the admin page, signs it in and sets its password. */
async function newAccount(admin: Page, browser: Browser, name: string) {
  const email = `e2e.offline.${Date.now()}@example.test`;
  await admin.goto("/admin/comptes");
  await admin.getByRole("button", { name: "Nouveau compte" }).click();
  const dialog = admin.getByRole("dialog", { name: "Nouveau compte" });
  await dialog.getByLabel(/^Nom/).fill(name);
  await dialog.getByLabel(/^Email/).fill(email);
  await dialog.getByLabel(/^Rôle/).selectOption("rt");
  await dialog.getByRole("button", { name: "Créer le compte" }).click();
  const revealed = admin.getByRole("dialog", { name: "Compte créé" });
  const temporary = (await revealed.getByTestId("temporary-password").textContent())?.trim() ?? "";
  await revealed.getByRole("button", { name: "J'ai noté le mot de passe" }).click();

  const context = await browser.newContext({
    baseURL: E2E_BASE_URL,
    storageState: anonymousState,
    viewport: TABLET,
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  const password = "Hors-reseau-revoque-2026";
  await loginAs(page, email, temporary);
  await page.getByLabel("Mot de passe provisoire").fill(temporary);
  await page.getByLabel("Nouveau mot de passe").fill(password);
  await page.getByLabel("Confirmation").fill(password);
  await page.getByRole("button", { name: "Enregistrer le nouveau mot de passe" }).click();
  await expect(page).toHaveURL(/\/$/);
  return { email, context, page };
}

test("« Déconnecter toutes les sessions » erases the copy of the tablet at the next contact", async ({
  browser,
}) => {
  const adminContext = await browser.newContext({
    baseURL: E2E_BASE_URL,
    storageState: storageStatePath("david"),
    viewport: COMPUTER,
  });
  const admin = await adminContext.newPage();
  const { email, context, page } = await newAccount(admin, browser, "Compte Hors Réseau E2E");
  const visitUrl = await createVisit(page, "TEST-008", "Visite e2e révocation");
  await openKept(page, visitUrl);
  const before = await localDatabases(page);
  expect(before.filter((name) => name.startsWith("ronde-"))).toHaveLength(1);

  await page.goto(`${visitUrl}?onglet=notes&zone=roof`);
  await context.setOffline(true);
  await page.getByTestId("zone-textarea").fill("Saisie d'un compte bientôt déconnecté.");
  await expectPending(page, 1);

  // The revocation date is truncated to the second: leave the second of the sign-in.
  await admin.waitForTimeout(1_100);
  await admin.reload();
  await admin
    .getByTestId(`account-${email}`)
    .getByRole("button", { name: "Déconnecter toutes les sessions" })
    .click();
  await admin
    .getByRole("dialog", { name: "Déconnecter toutes les sessions ?" })
    .getByRole("button", { name: "Déconnecter" })
    .click();

  await context.setOffline(false);
  await expect(page).toHaveURL(/\/connexion\?session=revoquee/, { timeout: 30_000 });
  await expect(page.getByTestId("session-wipe")).toHaveAttribute("data-done", "true");
  await expect(page.getByTestId("session-wipe")).toContainText("copie locale");
  expect((await localDatabases(page)).filter((name) => name.startsWith("ronde-"))).toEqual([]);
  await context.close();
  await adminContext.close();
});

test("two accounts on one tablet: each sees only its own copy", async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: E2E_BASE_URL,
    storageState: anonymousState,
    viewport: TABLET,
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  await loginAs(page, "alice", SEED_PASSWORD);
  const visitUrl = await createVisit(page, "TEST-006", "Visite e2e d'Alice, isolée");
  await openKept(page, visitUrl);
  const alice = (await localDatabases(page)).filter((name) => name.startsWith("ronde-"));
  expect(alice).toHaveLength(1);

  await page.getByTestId("account-menu-trigger").filter({ visible: true }).click();
  await page.getByRole("button", { name: "Se déconnecter" }).filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/connexion/);
  expect(await localDatabases(page)).not.toContain(alice[0]);

  await loginAs(page, "bruno", SEED_PASSWORD);
  await expect(indicator(page)).toBeVisible();
  await expect
    .poll(async () => (await localDatabases(page)).filter((name) => name.startsWith("ronde-")))
    .toHaveLength(1);
  expect(await localDatabases(page)).not.toContain(alice[0]);
  await waitForServiceWorker(page);

  await context.setOffline(true);
  await page.reload();
  const list = page.getByTestId("offline-visit-list");
  await expect(list).toBeVisible();
  await expect(list).not.toContainText("Visite e2e d'Alice, isolée");
  await expectNoBlockingViolation(page);
  await expectNoHorizontalOverflow(page);
  await page.goto(visitUrl).catch(() => undefined);
  await expect(page.getByText("Visite e2e d'Alice, isolée")).toHaveCount(0);
  await context.close();
});
