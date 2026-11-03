import "server-only";

import { requireRoleForAction, requireUserForAction } from "@/server/auth/session";
import { createPhotoService, type PhotoService } from "@/server/photos/service";
import type {
  ConfirmPhotoResult,
  PhotoPatch,
  PhotoView,
  PreparedPhotoUpload,
  PreparePhotoItem,
} from "@/server/photos/types";
import { getStorageService } from "@/server/storage";

const WRITERS = ["rt", "admin"] as const;

async function forReader(): Promise<PhotoService> {
  const user = await requireUserForAction();
  return createPhotoService(user, getStorageService());
}

async function forWriter(): Promise<PhotoService> {
  const user = await requireRoleForAction(WRITERS);
  return createPhotoService(user, getStorageService());
}

/** Ready photos of a visit with signed read URLs (RLS: readable with the visit). */
export async function listPhotos(visitId: string): Promise<PhotoView[]> {
  return (await forReader()).list(visitId);
}

/** Fresh signed URLs for photos the user can read. */
export async function renewPhotoUrls(photoIds: string[]): Promise<PhotoView[]> {
  return (await forReader()).renewUrls(photoIds);
}

/** Ready photos per zone key, for the Notes tab. */
export async function countPhotosByZone(visitId: string): Promise<Record<string, number>> {
  return (await forReader()).countByZone(visitId);
}

/** rt / admin: pending rows (RLS, cap) and signed upload URLs. */
export async function preparePhotoUpload(
  visitId: string,
  items: PreparePhotoItem[],
): Promise<PreparedPhotoUpload[]> {
  return (await forWriter()).prepare(visitId, items);
}

/** rt / admin: new upload URLs for a pending photo. */
export async function renewPhotoUpload(photoId: string): Promise<PreparedPhotoUpload> {
  return (await forWriter()).renewUpload(photoId);
}

/** rt / admin: checks the objects and marks the photo ready. */
export async function confirmPhotoUpload(photoId: string): Promise<ConfirmPhotoResult> {
  return (await forWriter()).confirm(photoId);
}

export async function updatePhoto(photoId: string, patch: PhotoPatch): Promise<PhotoView> {
  return (await forWriter()).update(photoId, patch);
}

export async function setCoverPhoto(photoId: string): Promise<PhotoView[]> {
  return (await forWriter()).setCover(photoId);
}

export async function movePhoto(
  photoId: string,
  direction: "before" | "after",
): Promise<PhotoView[]> {
  return (await forWriter()).move(photoId, direction);
}

export async function deletePhoto(photoId: string): Promise<void> {
  return (await forWriter()).remove(photoId);
}

export async function discardPendingPhoto(photoId: string): Promise<void> {
  return (await forWriter()).discardPending(photoId);
}
