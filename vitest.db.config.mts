import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Database and integration tests: run against the local `ronde_test` database.
 * Files run sequentially because they share the same database; each test isolates
 * itself in a transaction that is rolled back whenever possible.
 */
export default defineConfig({
  test: {
    environment: "node",
    env: {
      DATABASE_URL:
        process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/ronde_test",
      DATABASE_POOL_MAX: "2",
    },
    include: ["supabase/tests/**/*.test.ts", "tests/integration/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/mocks/server-only.ts", import.meta.url)),
    },
  },
});
