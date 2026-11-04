import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";

import { E2E_ENV } from "../playwright.config";

/** Synthetic images used by photos.spec.ts (never committed: generated on demand). */
export const FIXTURE_IMAGES_DIR = path.join(__dirname, "fixtures", "images");
/** Synthetic plans used by plans.spec.ts (generated on demand as well). */
export const FIXTURE_PLANS_DIR = path.join(__dirname, "fixtures", "plans");

/**
 * Before the whole suite: resets the local test database (skip with E2E_SKIP_DB_RESET=1),
 * empties the local storage folder and generates the synthetic images and plans when missing.
 */
export default function globalSetup(): void {
  rmSync(path.resolve(E2E_ENV.LOCAL_STORAGE_DIR), { recursive: true, force: true });
  if (!existsSync(path.join(FIXTURE_IMAGES_DIR, "fake.heic"))) {
    execFileSync("node", ["scripts/fixtures/generate-images.mjs", FIXTURE_IMAGES_DIR], {
      stdio: "inherit",
    });
  }
  if (!existsSync(path.join(FIXTURE_PLANS_DIR, "fake-plan.pdf"))) {
    execFileSync("node", ["scripts/fixtures/generate-plans.mjs", FIXTURE_PLANS_DIR], {
      stdio: "inherit",
    });
  }
  if (process.env.E2E_SKIP_DB_RESET === "1") return;
  execFileSync("pnpm", ["db:reset"], { stdio: "inherit" });
}
