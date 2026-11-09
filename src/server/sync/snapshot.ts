import "server-only";

import type { VisitSnapshot, VisitView } from "@/lib/offline/snapshot";
import type { CurrentUser } from "@/server/auth/types";
import { toZoneNoteView } from "@/server/domain/zone-notes";
import { createPhotoService } from "@/server/photos/service";
import { createPlanService } from "@/server/plans/service";
import type { PlanPageView } from "@/server/plans/types";
import { createParticipantRepository } from "@/server/repositories/participant-repository";
import { listAssignableProfiles } from "@/server/repositories/profile-repository";
import { createVisitRepository, type VisitDetail } from "@/server/repositories/visit-repository";
import { createZoneNoteRepository } from "@/server/repositories/zone-note-repository";
import { createReportService } from "@/server/reports/service";
import { createReserveService } from "@/server/reserves/service";
import type { StorageService } from "@/server/storage/types";

/** Serialises a visit detail (dates as ISO strings). */
export function toVisitView(visit: VisitDetail): VisitView {
  return {
    id: visit.id,
    siteId: visit.siteId,
    site: visit.site,
    type: visit.type,
    reason: visit.reason,
    title: visit.title,
    visitDate: visit.visitDate,
    subject: visit.subject,
    status: visit.status,
    writerId: visit.writerId,
    writerName: visit.writerName,
    createdBy: visit.createdBy,
    createdByName: visit.createdByName,
    completedAt: visit.completedAt?.toISOString() ?? null,
    completedByName: visit.completedByName,
    deletedAt: visit.deletedAt?.toISOString() ?? null,
    deletedByName: visit.deletedByName,
    duplicatedFromId: visit.duplicatedFromId,
    version: visit.version,
    updatedAt: visit.updatedAt.toISOString(),
    updatedByName: visit.updatedByName,
    permissions: visit.permissions,
  };
}

/**
 * Reads the whole visit as the user (RLS on every table), or `null` when the visit is not
 * visible. One read shared by the visit page and `GET /api/sync/visits/[id]`.
 */
export async function buildVisitSnapshot(
  user: CurrentUser,
  storage: StorageService,
  visitId: string,
): Promise<VisitSnapshot | null> {
  const visit = await createVisitRepository(user).getById(visitId);
  if (!visit) return null;
  const plans = createPlanService(user, storage);
  const [
    participants,
    writers,
    notes,
    photos,
    planList,
    markerSnapshot,
    reserves,
    reports,
    options,
  ] = await Promise.all([
    createParticipantRepository(user).list(visitId),
    listAssignableProfiles(user),
    createZoneNoteRepository(user).list(visitId),
    createPhotoService(user, storage).list(visitId),
    plans.listForVisit(visitId, visit.siteId),
    plans.markers.snapshotForVisit(visitId),
    createReserveService(user, storage).listDetailForVisit(visitId),
    createReportService(user, storage).list(visitId),
    createReportService(user, storage).lastOptions(visitId),
  ]);
  const planPages: Record<string, PlanPageView[]> = {};
  const planOriginals: Record<string, string | null> = {};
  for (const plan of planList) {
    try {
      const detail = await plans.getDetail(plan.id, visitId);
      planPages[plan.id] = detail.pages;
      planOriginals[plan.id] = detail.originalUrl;
    } catch {
      planPages[plan.id] = [];
      planOriginals[plan.id] = null;
    }
  }
  return {
    fetchedAt: new Date().toISOString(),
    user: { id: user.id, role: user.role },
    canCreate: user.role === "rt" || user.role === "admin",
    visit: toVisitView(visit),
    participants,
    writers,
    notes: notes.map(toZoneNoteView),
    photos,
    plans: planList,
    planPages,
    planOriginals,
    markers: markerSnapshot.markers,
    markersSnapshotAt: markerSnapshot.snapshotAt,
    reserves,
    reports,
    reportOptions: options,
  };
}
