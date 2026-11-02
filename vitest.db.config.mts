import { defineConfig } from "vitest/config";

/**
 * Database tests: run against the local `ronde_test` database with `pg`.
 * Files run sequentially because they share the same database; each test
 * isolates itself in a transaction that is rolled back.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["supabase/tests/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
