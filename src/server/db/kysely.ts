import "server-only";

import { Kysely, PostgresDialect } from "kysely";

import { getPool } from "./pool";
import type { DB } from "./schema.types";

let instance: Kysely<DB> | null = null;

/**
 * Typed Kysely instance over the shared pool. Prefer `withUser` / `withSystem`
 * (context.ts), which open the transaction and set the RLS context: this raw instance
 * must only be used by those helpers.
 */
export function getDb(): Kysely<DB> {
  if (!instance) {
    instance = new Kysely<DB>({ dialect: new PostgresDialect({ pool: getPool() }) });
  }
  return instance;
}

export type { DB } from "./schema.types";
