import "server-only";

import { recordAudit } from "@/server/auth/audit";
import type { UserRef } from "@/server/db/context";
import { isPhotoCategory, DEFAULT_PHOTO_CATEGORY } from "@/server/domain/photos";
import { ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { log } from "@/server/log";
import {
  READ_URL_TTL_SECONDS,
  type StorageService,
  UPLOAD_URL_TTL_SECONDS,
} from "@/server/storage/types";

import {
  createPhotoRepository,
  type PhotoPaths,
  type PhotoRepository,
  purgeStalePendingRows,
} from "./repository";
import type {
  ConfirmPhotoResult,
  PhotoPatch,
  PhotoRecord,
  PhotoView,
  PreparedPhotoUpload,
  PreparePhotoItem,
} from "./types";

const BUCKET = "visit-photos";
/** Bucket of the photos (scheduled purge). */
export const PHOTO_BUCKET = BUCKET;
const MISSING_OBJECT_MESSAGE = "Fichier manquant : l'envoi n'a pas abouti.";
const SIZE_MISMATCH_MESSAGE = "Fichier incomplet : l'envoi n'a pas abouti.";
const WRONG_TYPE_MESSAGE = "Le fichier envoyé n'est pas un JPEG.";

/** Minimum delay between two opportunistic purges in one process. */
const PURGE_MIN_INTERVAL_MS = 60_000;
let lastPurgeAt = 0;

/**
 * Photo use cases for one verified user. The repository enforces the rights through RLS and
 * the storage service only signs URLs for rows the repository returned: **no signed URL
 * without a `withUser` check**.
 */
export interface PhotoService {
  /** Ready photos of a visit with signed read URLs, after an opportunistic purge. */
  list(visitId: string): Promise<PhotoView[]>;
  /** Fresh signed URLs for photos the user can read (viewer open for more than 10 min). */
  renewUrls(photoIds: string[]): Promise<PhotoView[]>;
  /** Ready photos per zone key. */
  countByZone(visitId: string): Promise<Record<string, number>>;
  /** Creates the pending rows and signs two upload URLs per photo. */
  prepare(visitId: string, items: PreparePhotoItem[]): Promise<PreparedPhotoUpload[]>;
  /** Signs new upload URLs for a pending photo (expired URL). */
  renewUpload(photoId: string): Promise<PreparedPhotoUpload>;
  /** Checks both objects, marks the photo ready and writes the audit entry. */
  confirm(photoId: string): Promise<ConfirmPhotoResult>;
  update(photoId: string, patch: PhotoPatch): Promise<PhotoView>;
  setCover(photoId: string): Promise<PhotoView[]>;
  move(photoId: string, direction: "before" | "after"): Promise<PhotoView[]>;
  /** Deletes the row (RLS) then the objects; a storage failure is logged, the purge will retry. */
  remove(photoId: string): Promise<void>;
  /** Removes a pending row and its objects after the user cancelled an upload. */
  discardPending(photoId: string): Promise<void>;
}

/** Converts a record to its view with the signed URLs found for its paths. */
export function toPhotoView(
  photo: PhotoRecord,
  urls: Record<string, string>,
  expiresAt: Date,
): PhotoView {
  return {
    id: photo.id,
    visitId: photo.visitId,
    caption: photo.caption,
    category: isPhotoCategory(photo.category) ? photo.category : DEFAULT_PHOTO_CATEGORY,
    zoneKey: photo.zoneKey,
    zoneLabel: photo.zoneLabel,
    toSort: photo.toSort,
    hintViewId: photo.hintViewId,
    takenAt: photo.takenAt ? photo.takenAt.toISOString() : null,
    width: photo.width,
    height: photo.height,
    sizeBytes: photo.sizeBytes,
    sortOrder: photo.sortOrder,
    isCover: photo.isCover,
    originalFilename: photo.originalFilename,
    createdByName: photo.createdByName,
    createdAt: photo.createdAt.toISOString(),
    url: urls[photo.storagePath] ?? null,
    thumbUrl: photo.thumbPath ? (urls[photo.thumbPath] ?? null) : null,
    urlsExpireAt: expiresAt.toISOString(),
  };
}

/** Removes the objects of the given photos; failures are logged, never thrown. */
async function removeObjects(storage: StorageService, photos: PhotoPaths[]): Promise<void> {
  const paths = photos.flatMap((p) => [p.storagePath, ...(p.thumbPath ? [p.thumbPath] : [])]);
  if (paths.length === 0) return;
  try {
    await storage.remove(BUCKET, paths);
  } catch (error) {
    log.error("photos.remove_objects_failed", {
      count: paths.length,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Purges stale pending photos (rows then objects) at most once a minute per process. Called
 * when the Photos tab loads; a scheduled task replaces it at step 11.
 */
export async function purgeStalePendingPhotos(
  storage: StorageService,
  options: { force?: boolean } = {},
): Promise<number> {
  const now = Date.now();
  if (!options.force && now - lastPurgeAt < PURGE_MIN_INTERVAL_MS) return 0;
  lastPurgeAt = now;
  try {
    const purged = await purgeStalePendingRows();
    await removeObjects(storage, purged);
    if (purged.length > 0) log.info("photos.purged", { count: purged.length });
    return purged.length;
  } catch (error) {
    log.error("photos.purge_failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return 0;
  }
}

/** Creates the service for a verified user and a storage backend. */
export function createPhotoService(
  user: UserRef,
  storage: StorageService,
  repository: PhotoRepository = createPhotoRepository(user),
): PhotoService {
  async function withUrls(photos: PhotoRecord[]): Promise<PhotoView[]> {
    const paths = photos.flatMap((p) => [p.storagePath, ...(p.thumbPath ? [p.thumbPath] : [])]);
    const urls =
      paths.length > 0 ? await storage.createSignedReads(BUCKET, paths, READ_URL_TTL_SECONDS) : {};
    const expiresAt = new Date(Date.now() + READ_URL_TTL_SECONDS * 1000);
    return photos.map((photo) => toPhotoView(photo, urls, expiresAt));
  }

  async function signUploads(photo: PhotoRecord): Promise<PreparedPhotoUpload> {
    const [main, thumb] = await Promise.all([
      storage.createSignedUpload(BUCKET, photo.storagePath, {
        contentType: "image/jpeg",
        maxBytes: photo.sizeBytes ?? 0,
        expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
      }),
      storage.createSignedUpload(BUCKET, photo.thumbPath!, {
        contentType: "image/jpeg",
        // The thumbnail size is not stored: the bucket limit and the 4 MB rule apply.
        maxBytes: 4 * 1024 * 1024,
        expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
      }),
    ]);
    return {
      photoId: photo.id,
      main: { url: main.url, headers: main.headers, expiresAt: main.expiresAt.toISOString() },
      thumb: { url: thumb.url, headers: thumb.headers, expiresAt: thumb.expiresAt.toISOString() },
    };
  }

  return {
    async list(visitId) {
      await purgeStalePendingPhotos(storage);
      return withUrls(await repository.list(visitId));
    },

    async renewUrls(photoIds) {
      return withUrls(await repository.listByIds(photoIds));
    },

    countByZone(visitId) {
      return repository.countByZone(visitId);
    },

    async prepare(visitId, items) {
      const photos = await repository.createPending(visitId, items);
      return Promise.all(photos.map(signUploads));
    },

    async renewUpload(photoId) {
      return signUploads(await repository.findPendingForUpload(photoId));
    },

    async confirm(photoId) {
      let photo: PhotoRecord;
      try {
        photo = await repository.findPendingForUpload(photoId);
      } catch (error) {
        if (error instanceof ValidationError) {
          // Already ready (double confirmation): answer with the photo.
          const [existing] = await withUrls(await repository.listByIds([photoId]));
          if (existing) return { ok: true, photo: existing };
        }
        if (error instanceof ForbiddenError || error instanceof NotFoundError) {
          return { ok: false, error: error.message, retryable: false };
        }
        throw error;
      }
      const [main, thumb] = await Promise.all([
        storage.stat(BUCKET, photo.storagePath),
        storage.stat(BUCKET, photo.thumbPath!),
      ]);
      if (!main || !thumb) return { ok: false, error: MISSING_OBJECT_MESSAGE, retryable: true };
      if (photo.sizeBytes !== null && main.size !== photo.sizeBytes) {
        return { ok: false, error: SIZE_MISMATCH_MESSAGE, retryable: true };
      }
      if (!/^image\/jpeg\b/.test(main.contentType) || !/^image\/jpeg\b/.test(thumb.contentType)) {
        return { ok: false, error: WRONG_TYPE_MESSAGE, retryable: false };
      }
      let ready: PhotoRecord;
      try {
        ready = await repository.markReady(photoId);
      } catch (error) {
        if (error instanceof ForbiddenError || error instanceof NotFoundError) {
          return { ok: false, error: error.message, retryable: false };
        }
        throw error;
      }
      await recordAudit(
        "photo.uploaded",
        "photo",
        ready.id,
        {
          visit_id: ready.visitId,
          size_bytes: ready.sizeBytes,
          width: ready.width,
          height: ready.height,
          zone_key: ready.zoneKey,
        },
        user.id,
      );
      const [view] = await withUrls([ready]);
      return { ok: true, photo: view! };
    },

    async update(photoId, patch) {
      const [view] = await withUrls([await repository.update(photoId, patch)]);
      return view!;
    },

    async setCover(photoId) {
      return withUrls(await repository.setCover(photoId));
    },

    async move(photoId, direction) {
      return withUrls(await repository.move(photoId, direction));
    },

    async remove(photoId) {
      const paths = await repository.remove(photoId);
      await recordAudit(
        "photo.deleted",
        "photo",
        paths.id,
        { storage_path: paths.storagePath },
        user.id,
      );
      await removeObjects(storage, [paths]);
    },

    async discardPending(photoId) {
      const paths = await repository.discardPending(photoId);
      if (paths) await removeObjects(storage, [paths]);
    },
  };
}
