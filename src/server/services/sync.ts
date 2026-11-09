import "server-only";

import type { SyncOperation, SyncResult } from "@/lib/offline/ops";
import type { VisitSnapshot } from "@/lib/offline/snapshot";
import { requireRoleForAction, requireUserForAction } from "@/server/auth/session";
import { getStorageService } from "@/server/storage";
import { applySyncBatch } from "@/server/sync/apply";
import { buildVisitSnapshot } from "@/server/sync/snapshot";

const WRITERS = ["rt", "admin"] as const;

/** Full snapshot of a visit for the current user (visit page and `GET /api/sync/visits/[id]`). */
export async function getVisitSnapshot(visitId: string): Promise<VisitSnapshot | null> {
  const user = await requireUserForAction();
  return buildVisitSnapshot(user, getStorageService(), visitId);
}

/** rt / admin: applies a batch of device operations (`POST /api/sync`). */
export async function applyDeviceOperations(ops: SyncOperation[]): Promise<SyncResult[]> {
  const user = await requireRoleForAction(WRITERS);
  return applySyncBatch({ user, storage: getStorageService() }, ops);
}
