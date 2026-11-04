import "server-only";

import { requireRoleForAction, requireUserForAction } from "@/server/auth/session";
import { createPlanService, type PlanService } from "@/server/plans/service";
import type {
  ConfirmPlanResult,
  MarkerView,
  PlanDetailView,
  PlanView,
  PreparedPageUpload,
  PreparedPlanUpload,
  PreparePageInput,
  PreparePlanInput,
} from "@/server/plans/types";
import { getStorageService } from "@/server/storage";

const WRITERS = ["rt", "admin"] as const;

async function forReader(): Promise<PlanService> {
  const user = await requireUserForAction();
  return createPlanService(user, getStorageService());
}

async function forWriter(): Promise<PlanService> {
  const user = await requireRoleForAction(WRITERS);
  return createPlanService(user, getStorageService());
}

/** Ready plans of a site (every active user). */
export async function listSitePlans(
  siteId: string,
  options?: { includeArchived?: boolean },
): Promise<PlanView[]> {
  return (await forReader()).listForSite(siteId, options);
}

/** Plans offered in a visit, with the marker counts of that visit. */
export async function listVisitPlans(visitId: string, siteId: string): Promise<PlanView[]> {
  return (await forReader()).listForVisit(visitId, siteId);
}

/** A ready plan with the signed URLs of its pages. */
export async function getPlanDetail(planId: string, visitId?: string): Promise<PlanDetailView> {
  return (await forReader()).getDetail(planId, visitId);
}

/** Markers of a visit with their photo thumbnails. */
export async function listVisitMarkers(visitId: string): Promise<MarkerView[]> {
  return (await forReader()).markers.listForVisit(visitId);
}

/** Markers linked to the given photos (viewer mention and grid badge). */
export async function markersByPhotoIds(photoIds: string[]) {
  return (await forReader()).markers.byPhotoIds(photoIds);
}

/** Markers of the visit without a photo (incomplete point). */
export async function countMarkersWithoutPhoto(visitId: string): Promise<number> {
  return (await forReader()).markers.countWithoutPhoto(visitId);
}

/** rt / admin: pending plan row (RLS) and the upload URL of the original. */
export async function preparePlanUpload(
  siteId: string,
  input: PreparePlanInput,
): Promise<PreparedPlanUpload> {
  return (await forWriter()).prepare(siteId, input);
}

/** rt / admin: page rows and their upload URLs. */
export async function preparePageUploads(
  planId: string,
  pages: PreparePageInput[],
): Promise<PreparedPageUpload[]> {
  return (await forWriter()).preparePages(planId, pages);
}

/** rt / admin: fresh upload URLs for a pending plan. */
export async function renewPlanUploads(planId: string) {
  return (await forWriter()).renewUploads(planId);
}

/** rt / admin: checks every object and marks the plan ready. */
export async function confirmPlanUpload(planId: string): Promise<ConfirmPlanResult> {
  return (await forWriter()).confirm(planId);
}

/** rt / admin: cancels an import. */
export async function discardPlanUpload(planId: string): Promise<void> {
  return (await forWriter()).discard(planId);
}

export async function renamePlan(planId: string, name: string): Promise<PlanView> {
  return (await forWriter()).rename(planId, name);
}

export async function setPlanArchived(planId: string, archived: boolean): Promise<PlanView> {
  return (await forWriter()).setArchived(planId, archived);
}

export async function createMarker(
  visitId: string,
  input: {
    planId: string;
    page: number;
    x: number;
    y: number;
    label?: string | null;
    photoId?: string | null;
  },
): Promise<MarkerView> {
  return (await forWriter()).markers.create(visitId, input);
}

export async function moveMarker(markerId: string, x: number, y: number): Promise<MarkerView> {
  return (await forWriter()).markers.move(markerId, x, y);
}

export async function updateMarker(
  markerId: string,
  patch: { label?: string | null; photoId?: string | null },
): Promise<MarkerView> {
  return (await forWriter()).markers.update(markerId, patch);
}

export async function removeMarker(markerId: string): Promise<void> {
  return (await forWriter()).markers.remove(markerId);
}
