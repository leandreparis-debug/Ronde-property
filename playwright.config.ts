import { defineConfig, devices } from "@playwright/test";

import { E2E_BASE_URL, storageStatePath } from "./e2e/helpers/auth";

const baseURL = E2E_BASE_URL;
const PORT = Number(new URL(baseURL).port);

/**
 * End-to-end tests run against a production build (`next build && next start`) with the
 * `local` auth provider on the `ronde_test` database, reset before the suite
 * (e2e/global-setup.ts). The `setup` project signs every seeded role in through the real
 * form and stores its cookies; the other tests reuse those storage states.
 */
export const E2E_ENV = {
  AUTH_PROVIDER: "local",
  ALLOW_LOCAL_AUTH: "true",
  LOCAL_AUTH_SECRET: process.env.LOCAL_AUTH_SECRET ?? "e2e-local-secret-ronde-0123456789abcdef",
  DATABASE_URL:
    process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/ronde_test",
  DATABASE_POOL_MAX: "4",
};

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  timeout: 30_000,
  use: {
    baseURL,
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "chromium",
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], storageState: storageStatePath("alice") },
    },
  ],
  webServer: {
    command: `pnpm build && pnpm start --port ${PORT}`,
    url: `${baseURL}/connexion`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    env: E2E_ENV,
  },
});
