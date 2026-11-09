import "server-only";

import type { SyncResult } from "@/lib/offline/ops";
import { withSystem } from "@/server/db/context";

/**
 * Idempotence of `POST /api/sync` (migration 21): an operation already applied for this user
 * answers with its stored result instead of running again. Table of the service only.
 */
export async function findAppliedResult(userId: string, opId: string): Promise<SyncResult | null> {
  const row = await withSystem("sync.idempotency.read", (trx) =>
    trx
      .selectFrom("sync_operations")
      .select("result")
      .where("user_id", "=", userId)
      .where("op_id", "=", opId)
      .executeTakeFirst(),
  );
  return row ? (row.result as unknown as SyncResult) : null;
}

/** Records the result of an applied operation. A duplicate (two tabs) is ignored. */
export async function recordAppliedResult(
  userId: string,
  opId: string,
  result: SyncResult,
): Promise<void> {
  await withSystem("sync.idempotency.write", (trx) =>
    trx
      .insertInto("sync_operations")
      .values({
        user_id: userId,
        op_id: opId,
        result: JSON.stringify(result),
      })
      .onConflict((oc) => oc.doNothing())
      .execute(),
  );
}

/** Deletes the records older than `maxAge` (scheduled purge). */
export async function purgeSyncOperationsInTrx(
  trx: Parameters<Parameters<typeof withSystem>[1]>[0],
  maxAge = "30 days",
): Promise<number> {
  const { sql } = await import("kysely");
  const { rows } = await sql<{ removed: number }>`
    select private.purge_sync_operations(${maxAge}::interval) as removed
  `.execute(trx);
  return Number(rows[0]?.removed ?? 0);
}
