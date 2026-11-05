import "server-only";

import { sql } from "kysely";

import { withSystem } from "@/server/db/context";

/**
 * True when a session opened at `authenticatedAt` was revoked (`profiles.sessions_revoked_at`,
 * truncated to the second by the database). A session opened during the revocation second
 * stays valid: Supabase `amr` timestamps are in seconds.
 */
export function isSessionRevoked(authenticatedAt: Date, revokedAt: Date | string | null): boolean {
  if (revokedAt === null) return false;
  return authenticatedAt.getTime() < new Date(revokedAt).getTime();
}

/** Revokes every session of the user (shared by the `local` and `supabase` providers). */
export async function revokeSessionsInDatabase(userId: string, reason: string): Promise<void> {
  await withSystem(reason, (trx) =>
    trx
      .updateTable("profiles")
      .set({ sessions_revoked_at: sql<string>`date_trunc('second', now())` })
      .where("id", "=", userId)
      .execute(),
  );
}
