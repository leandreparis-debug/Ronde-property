import { execFileSync } from "node:child_process";

/** Resets the local test database before the whole suite (skip with E2E_SKIP_DB_RESET=1). */
export default function globalSetup(): void {
  if (process.env.E2E_SKIP_DB_RESET === "1") return;
  execFileSync("pnpm", ["db:reset"], { stdio: "inherit" });
}
