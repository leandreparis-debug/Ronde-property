import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";

import { E2E_ENV } from "../playwright.config";

/** Synthetic images used by photos.spec.ts (never committed: generated on demand). */
export const FIXTURE_IMAGES_DIR = path.join(__dirname, "fixtures", "images");

/**
 * Before the whole suite: resets the local test database (skip with E2E_SKIP_DB_RESET=1),
 * empties the local storage folder and generates the synthetic images when missing.
 */
export default function globalSetup(): void {
  rmSync(path.resolve(E2E_ENV.LOCAL_STORAGE_DIR), { recursive: true, force: true });
  if (!existsSync(path.join(FIXTURE_IMAGES_DIR, "fake.heic"))) {
    execFileSync("node", ["scripts/fixtures/generate-images.mjs", FIXTURE_IMAGES_DIR], {
      stdio: "inherit",
    });
  }
  if (process.env.E2E_SKIP_DB_RESET === "1") return;
  execFileSync("pnpm", ["db:reset"], { stdio: "inherit" });
}
