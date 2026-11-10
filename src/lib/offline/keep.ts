import type { RondeLocalDb } from "./db";
import { blobKeys } from "./db";
import { mergeSnapshot, removeVisitLocally } from "./merge";
import type { VisitSnapshot } from "./snapshot";

/** Typical thumbnail sizes, for the estimate shown before the download. */
const PHOTO_THUMB_ESTIMATE = 40 * 1024;
const PAGE_THUMB_ESTIMATE = 15 * 1024;

/** One file of the offline copy. */
export interface KeepItem {
  key: string;
  url: string;
  /** Known or estimated size in bytes. */
  size: number;
}

/**
 * What « Garder hors réseau » downloads: every photo (image and thumbnail) and, for the
 * plans, every page of a plan that is not archived and only the pages carrying a marker of
 * the visit for an archived plan (« pages utiles »).
 */
export function planKeepItems(snapshot: VisitSnapshot): KeepItem[] {
  const items: KeepItem[] = [];
  for (const photo of snapshot.photos) {
    if (photo.url) {
      items.push({
        key: blobKeys.photoMain(photo.id),
        url: photo.url,
        size: photo.sizeBytes ?? 300 * 1024,
      });
    }
    if (photo.thumbUrl) {
      items.push({
        key: blobKeys.photoThumb(photo.id),
        url: photo.thumbUrl,
        size: PHOTO_THUMB_ESTIMATE,
      });
    }
  }
  for (const plan of snapshot.plans) {
    const pages = snapshot.planPages[plan.id] ?? [];
    const marked = new Set(
      snapshot.markers.filter((marker) => marker.planId === plan.id).map((marker) => marker.page),
    );
    for (const page of pages) {
      if (plan.isArchived && !marked.has(page.pageNumber)) continue;
      if (page.imageUrl) {
        items.push({
          key: blobKeys.pageImage(plan.id, page.pageNumber),
          url: page.imageUrl,
          size: estimatePageSize(page.width, page.height, page.imageMime),
        });
      }
      if (page.thumbUrl) {
        items.push({
          key: blobKeys.pageThumb(plan.id, page.pageNumber),
          url: page.thumbUrl,
          size: PAGE_THUMB_ESTIMATE,
        });
      }
    }
  }
  return items;
}

/** Rough size of a converted page (PNG line drawings are around 0,25 byte per pixel). */
function estimatePageSize(width: number, height: number, mime: string): number {
  const pixels = width * height;
  return Math.round(pixels * (mime === "image/png" ? 0.25 : 0.12));
}

/** Estimated size of the download, in bytes. */
export function estimateKeepSize(snapshot: VisitSnapshot): number {
  return planKeepItems(snapshot).reduce((sum, item) => sum + item.size, 0);
}

export interface KeepProgress {
  done: number;
  total: number;
  bytes: number;
}

export interface KeepDeps {
  fetchBlob: (url: string) => Promise<Blob>;
  onProgress?: (progress: KeepProgress) => void;
  signal?: AbortSignal;
  concurrency?: number;
}

/**
 * Keeps a visit offline: merges the snapshot, downloads the images that are not stored yet
 * (3 at a time, resumable) and marks the visit as kept. A failed download is skipped and
 * reported; the next call downloads what is missing.
 */
export async function keepVisitOffline(
  db: RondeLocalDb,
  snapshot: VisitSnapshot,
  deps: KeepDeps,
): Promise<{ downloaded: number; failed: number; bytes: number }> {
  // The visit is marked « kept » only once its images are on the device: the badge
  // « Disponible hors réseau » must not appear while the download is still running.
  await mergeSnapshot(db, snapshot);
  const visitId = snapshot.visit.id;
  const items = planKeepItems(snapshot);
  const existing = new Set(
    (await db.blobs.where("visitId").equals(visitId).toArray()).map((blob) => blob.key),
  );
  const todo = items.filter((item) => !existing.has(item.key));
  let done = 0;
  let failed = 0;
  let bytes = 0;
  const queue = [...todo];
  const worker = async () => {
    while (queue.length > 0) {
      if (deps.signal?.aborted) return;
      const item = queue.shift()!;
      try {
        const blob = await deps.fetchBlob(item.url);
        await db.blobs.put({ key: item.key, visitId, blob, size: blob.size });
        bytes += blob.size;
        done += 1;
      } catch {
        failed += 1;
      }
      deps.onProgress?.({ done: done + failed, total: todo.length, bytes });
    }
  };
  await Promise.all(Array.from({ length: Math.min(deps.concurrency ?? 3, todo.length) }, worker));
  await db.visits.update(visitId, { kept: true, keptAt: new Date().toISOString() });
  return { downloaded: done, failed, bytes };
}

/**
 * « Ne plus garder hors réseau »: drops the images and the rows of the visit, unless
 * operations still wait for the server (the caller shows why).
 */
export async function unkeepVisit(
  db: RondeLocalDb,
  visitId: string,
): Promise<{ ok: true } | { ok: false; reason: "pending" }> {
  const pending = await db.outbox.where("visitId").equals(visitId).count();
  if (pending > 0) return { ok: false, reason: "pending" };
  await removeVisitLocally(db, visitId);
  return { ok: true };
}

/** Fetches a signed URL as a blob (same-origin or Supabase, both allowed by the CSP). */
export async function fetchBlob(url: string): Promise<Blob> {
  const response = await fetch(url, { credentials: "same-origin" });
  if (!response.ok) throw new Error(`Téléchargement refusé (${response.status}).`);
  return response.blob();
}
