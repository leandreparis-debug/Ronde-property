import { defineConfig, devices } from "@playwright/test";

import base from "./playwright.config";
import { storageStatePath } from "./e2e/helpers/auth";

/**
 * Acceptance of phase 1 (specification § 14): one file per criterion in `e2e/acceptance/`,
 * run one after the other on a production build (same server and database reset as the e2e
 * suite), with a readable HTML report in `playwright-report-acceptance/`.
 */
export default defineConfig({
  ...base,
  testDir: "./e2e",
  testMatch: [/acceptance\/.*\.spec\.ts/, /auth\.setup\.ts/],
  testIgnore: [],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report-acceptance" }]],
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/, use: { ...devices["Desktop Chrome"] } },
    {
      name: "acceptance",
      testMatch: /acceptance\/.*\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], storageState: storageStatePath("alice") },
    },
  ],
});
