import "server-only";

import { recordAuditInTrx } from "@/server/auth/audit";
import { withSystem } from "@/server/db/context";
import { log } from "@/server/log";
import { purgeStalePendingPhotoRowsInTrx } from "@/server/photos/repository";
import { PHOTO_BUCKET } from "@/server/photos/service";
import { purgeStalePendingPlanRowsInTrx } from "@/server/plans/repository";
import { PLAN_BUCKET } from "@/server/plans/service";
import { purgeStalePendingReportRowsInTrx } from "@/server/reports/repository";
import { REPORTS_BUCKET } from "@/server/reports/service";
import type { StorageBucket, StorageService } from "@/server/storage/types";

/** What the scheduled purge removed. */
export interface PurgeSummary {
  photos: number;
  plans: number;
  reports: number;
  /** Storage objects removed (originals, thumbnails, plan pages, PDFs). */
  objects: number;
  /** Storage objects whose removal failed (logged; retried by nobody: orphan files). */
  objectFailures: number;
}

async function removeAll(
  storage: StorageService,
  bucket: StorageBucket,
  paths: string[],
): Promise<{ removed: number; failed: number }> {
  if (paths.length === 0) return { removed: 0, failed: 0 };
  try {
    await storage.remove(bucket, paths);
    return { removed: paths.length, failed: 0 };
  } catch (error) {
    log.error("cron.purge.remove_objects_failed", { bucket, count: paths.length, error });
    return { removed: 0, failed: paths.length };
  }
}

/**
 * Scheduled purge (`/api/cron/purge`, every night): in one system transaction, deletes the
 * `pending` photos, plans and reports older than 24 hours (uploads never confirmed: tab closed,
 * network lost) and records `system.purge` in the audit; then removes their files through
 * `StorageService`. The opportunistic purges of the tabs stay in place.
 */
export async function runScheduledPurge(storage: StorageService): Promise<PurgeSummary> {
  const purged = await withSystem("cron.purge", async (trx) => {
    const photos = await purgeStalePendingPhotoRowsInTrx(trx);
    const plans = await purgeStalePendingPlanRowsInTrx(trx);
    const reports = await purgeStalePendingReportRowsInTrx(trx);
    await recordAuditInTrx(
      trx,
      "system.purge",
      "system",
      null,
      { photos: photos.length, plans: plans.length, reports: reports.length },
      null,
    );
    return { photos, plans, reports };
  });

  // Files after the commit: a row is never left without its file being at least attempted.
  const results = await Promise.all([
    removeAll(
      storage,
      PHOTO_BUCKET,
      purged.photos.flatMap((p) => [p.storagePath, ...(p.thumbPath ? [p.thumbPath] : [])]),
    ),
    removeAll(
      storage,
      PLAN_BUCKET,
      purged.plans.flatMap((p) => [p.storagePath, ...p.pagePaths]),
    ),
    removeAll(storage, REPORTS_BUCKET, purged.reports),
  ]);
  const summary: PurgeSummary = {
    photos: purged.photos.length,
    plans: purged.plans.length,
    reports: purged.reports.length,
    objects: results.reduce((sum, r) => sum + r.removed, 0),
    objectFailures: results.reduce((sum, r) => sum + r.failed, 0),
  };
  log.info("cron.purge.done", { ...summary });
  return summary;
}
