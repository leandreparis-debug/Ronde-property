import "server-only";

import { sql } from "kysely";

import type { Trx } from "@/server/db/context";
import { withSystem } from "@/server/db/context";

/** Application-level audit actions written by the auth, account and photo services. */
export type AuthAuditAction =
  | "auth.signed_in"
  | "auth.sign_in_failed"
  | "auth.signed_out"
  | "account.created"
  | "account.password_reset"
  | "photo.uploaded"
  | "photo.deleted"
  | "system.purge";

/**
 * Writes an audit entry through `private.audit` (the only allowed writer of audit_log).
 * `actorId` is null for a failed sign-in, whose details carry only a hash of the email.
 */
export async function recordAuditInTrx(
  trx: Trx,
  action: AuthAuditAction,
  entityType: string,
  entityId: string | null,
  details: Record<string, unknown>,
  actorId: string | null,
): Promise<void> {
  await sql`select private.audit(${action}, ${entityType}, ${entityId}::uuid, ${JSON.stringify(details)}::jsonb, ${actorId}::uuid)`.execute(
    trx,
  );
}

/** Same as `recordAuditInTrx`, in its own system transaction. */
export async function recordAudit(
  action: AuthAuditAction,
  entityType: string,
  entityId: string | null,
  details: Record<string, unknown>,
  actorId: string | null,
): Promise<void> {
  await withSystem(`audit.${action}`, (trx) =>
    recordAuditInTrx(trx, action, entityType, entityId, details, actorId),
  );
}
