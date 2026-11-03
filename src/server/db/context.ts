import "server-only";

import { NoResultError, sql, type Transaction } from "kysely";

import { NotFoundError, translateError } from "@/server/errors";
import { log } from "@/server/log";

import { getDb } from "./kysely";
import type { DB } from "./schema.types";

/** Transaction handle passed to data callbacks. */
export type Trx = Transaction<DB>;

/** Minimal identity needed to open a user context: the verified user id. */
export interface UserRef {
  id: string;
}

function wrapError(error: unknown): never {
  if (error instanceof NoResultError) {
    throw new NotFoundError(undefined, { cause: error });
  }
  throw translateError(error);
}

/**
 * Runs `fn` in a transaction executed **as the given user**: `set local role authenticated`
 * and `request.jwt.claims = {"sub": id, "role": "authenticated"}`, so that Row Level
 * Security and `auth.uid()` behave exactly as through the Supabase API. Everything is
 * `set local`: the connection returns to the pool clean, whatever happens.
 *
 * The user must have been verified server-side first (see `getCurrentUser`).
 *
 * @example
 * const visits = await withUser(user, (trx) =>
 *   trx.selectFrom("visit_summaries").select(["id", "title"]).execute(),
 * );
 */
export async function withUser<T>(user: UserRef, fn: (trx: Trx) => Promise<T>): Promise<T> {
  const claims = JSON.stringify({ sub: user.id, role: "authenticated" });
  try {
    return await getDb()
      .transaction()
      .execute(async (trx) => {
        await sql`set local role authenticated`.execute(trx);
        await sql`select set_config('request.jwt.claims', ${claims}, true)`.execute(trx);
        return fn(trx);
      });
  } catch (error) {
    wrapError(error);
  }
}

/**
 * Runs `fn` in a transaction **as `service_role`** (`set local role service_role`), which
 * bypasses RLS exactly like the Supabase service key. The connection owner only needs to be a
 * member of `service_role` (and of `authenticated` for `withUser`): on Supabase the
 * application connects with a dedicated login role, never with `postgres`.
 * Reserved to explicit server services: session lookup, account administration, VIGIE
 * import. Each call names its reason, which is logged. Never call it from a page or a
 * component.
 *
 * @example
 * const profile = await withSystem("session", (trx) =>
 *   trx.selectFrom("profiles").select(["id", "role", "is_active"]).where("id", "=", id).executeTakeFirst(),
 * );
 */
export async function withSystem<T>(reason: string, fn: (trx: Trx) => Promise<T>): Promise<T> {
  log.debug("db.system", { reason });
  try {
    return await getDb()
      .transaction()
      .execute(async (trx) => {
        await sql`set local role service_role`.execute(trx);
        return fn(trx);
      });
  } catch (error) {
    wrapError(error);
  }
}
