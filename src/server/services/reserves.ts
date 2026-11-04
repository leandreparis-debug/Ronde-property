import "server-only";

import type { ReserveWrite } from "@/lib/reserves/schema";
import { requireRoleForAction, requireUserForAction } from "@/server/auth/session";
import type { PlacementInput } from "@/server/reserves/repository";
import { createReserveService, type ReserveService } from "@/server/reserves/service";
import type {
  PhotoReserveLink,
  ReserveDetail,
  ReserveHistoryEntry,
  ReserveIncompleteCounts,
  ReserveListItem,
  ReserveMarkerRef,
  ReserveSaveResult,
  ResponsibleSuggestions,
  SiteReservesSummary,
} from "@/server/reserves/types";
import { getStorageService } from "@/server/storage";

const WRITERS = ["rt", "admin"] as const;

async function forReader(): Promise<ReserveService> {
  const user = await requireUserForAction();
  return createReserveService(user, getStorageService());
}

async function forWriter(): Promise<ReserveService> {
  const user = await requireRoleForAction(WRITERS);
  return createReserveService(user, getStorageService());
}

/** Reserves of a visit (every active user, RLS). */
export async function listVisitReserves(visitId: string): Promise<ReserveListItem[]> {
  return (await forReader()).listForVisit(visitId);
}

/** Open reserves of a site: counters and the 10 most urgent (site page). */
export async function getSiteReservesSummary(siteId: string): Promise<SiteReservesSummary> {
  return (await forReader()).siteSummary(siteId);
}

/** A reserve with its photos (detail page, edit sheet). */
export async function getReserve(id: string): Promise<ReserveDetail> {
  return (await forReader()).get(id);
}

/** History of a reserve (`reserve_events`). */
export async function getReserveHistory(id: string): Promise<ReserveHistoryEntry[]> {
  return (await forReader()).history(id);
}

/** Incomplete points of a visit related to reserves. */
export async function countReserveIncomplete(visitId: string): Promise<ReserveIncompleteCounts> {
  return (await forReader()).incompleteCounts(visitId);
}

/** Reserves linked to photos (viewer mention and grid badge). */
export async function reservesByPhotoIds(
  photoIds: string[],
): Promise<Record<string, PhotoReserveLink[]>> {
  return (await forReader()).byPhotoIds(photoIds);
}

/** Responsible choices of the sheet (rt / admin only: the sheet is a writer screen). */
export async function getResponsibleSuggestions(siteId: string): Promise<ResponsibleSuggestions> {
  return (await forWriter()).suggestions(siteId);
}

export async function createReserve(
  visitId: string,
  input: ReserveWrite,
  photoIds: string[],
): Promise<ReserveDetail> {
  return (await forWriter()).create(visitId, input, photoIds);
}

export async function updateReserve(
  id: string,
  input: ReserveWrite,
  expectedVersion: number,
  photoIds?: string[],
): Promise<ReserveSaveResult> {
  return (await forWriter()).update(id, input, expectedVersion, photoIds);
}

export async function setReserveStatus(
  id: string,
  status: ReserveDetail["status"],
): Promise<ReserveDetail> {
  return (await forWriter()).setStatus(id, status);
}

export async function deleteReserve(id: string): Promise<void> {
  return (await forWriter()).softDelete(id);
}

export async function linkReservePhotos(id: string, photoIds: string[]): Promise<void> {
  return (await forWriter()).linkPhotos(id, photoIds);
}

export async function unlinkReservePhoto(id: string, photoId: string): Promise<void> {
  return (await forWriter()).unlinkPhoto(id, photoId);
}

export async function placeReserveOnPlan(
  id: string,
  placement: PlacementInput,
): Promise<ReserveMarkerRef> {
  return (await forWriter()).placeOnPlan(id, placement);
}

export async function removeReserveFromPlan(id: string): Promise<void> {
  return (await forWriter()).removeFromPlan(id);
}
