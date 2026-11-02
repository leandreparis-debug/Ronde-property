import "server-only";

import pg from "pg";

import { env, requireDatabaseUrl } from "@/lib/env";

/*
 * Connection pool, created lazily on first use so that the application builds and renders
 * public pages without a database.
 *
 * Sizing: Next.js on Vercel runs many short-lived serverless instances; each one keeps its own
 * pool, so `max` stays small (5 by default, `DATABASE_POOL_MAX`). In production the URL must
 * be the Supabase **transaction pooler** (port 6543), which multiplexes those connections.
 * Prepared statements are not used (Kysely sends parameterised simple queries), which is what
 * the transaction pooler requires.
 */

// numeric (surface_m2, marker coordinates) as number, matching kysely-codegen --numeric-parser number.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (value) => Number.parseFloat(value));
// date (visit_date, due_date) as "YYYY-MM-DD" text, never shifted by the server time zone
// (kysely-codegen --date-parser string).
pg.types.setTypeParser(pg.types.builtins.DATE, (value) => value);

let pool: pg.Pool | null = null;

/** Returns the shared pool, creating it on first call. Throws if DATABASE_URL is missing. */
export function getPool(): pg.Pool {
  if (!pool) {
    pool = new pg.Pool({
      connectionString: requireDatabaseUrl(),
      max: env.DATABASE_POOL_MAX,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
      allowExitOnIdle: true,
    });
    pool.on("error", (error) => {
      console.error("[ronde] idle database client error", error.message);
    });
  }
  return pool;
}

/** Closes the pool (tests and scripts). */
export async function closePool(): Promise<void> {
  if (pool) {
    const current = pool;
    pool = null;
    await current.end();
  }
}
