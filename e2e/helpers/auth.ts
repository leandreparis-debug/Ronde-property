import path from "node:path";

import { expect, type Page } from "@playwright/test";

/** Base URL of the e2e server (playwright.config.ts). */
export const E2E_BASE_URL = "http://127.0.0.1:3100";

/** Seeded accounts (supabase/seed.sql). Local password shared by every fictitious account. */
export const SEED_PASSWORD = "Ronde-test-2026";

export const SEED_USERS = {
  alice: { email: "rt.alice@example.test", name: "Alice Fictive", role: "rt" },
  bruno: { email: "rt.bruno@example.test", name: "Bruno Fictif", role: "rt" },
  emma: { email: "rt.emma@example.test", name: "Emma Fictive", role: "rt" },
  claire: { email: "direction.claire@example.test", name: "Claire Fictive", role: "direction" },
  david: { email: "admin.david@example.test", name: "David Fictif", role: "admin" },
  inactif: { email: "rt.inactif@example.test", name: "Inactif Fictif", role: "rt" },
} as const;

export type SeedUser = keyof typeof SEED_USERS;

/** Roles whose storage state is prepared by auth.setup.ts. */
export const STORED_ROLES = [
  "alice",
  "bruno",
  "claire",
  "david",
] as const satisfies readonly SeedUser[];

/** Path of the stored cookies of a role (ignored by git). */
export function storageStatePath(role: SeedUser): string {
  return path.join(__dirname, "..", ".auth", `${role}.json`);
}

/** Signs in through the real form and waits for the redirect. */
export async function loginAs(
  page: Page,
  user: SeedUser | string,
  password = SEED_PASSWORD,
  next?: string,
) {
  const email = user in SEED_USERS ? SEED_USERS[user as SeedUser].email : user;
  await page.goto(next ? `/connexion?next=${encodeURIComponent(next)}` : "/connexion");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).not.toHaveURL(/\/connexion(\?|$)/);
}

/** Empty storage state: a visitor without any cookie. */
export const anonymousState = { cookies: [], origins: [] };
