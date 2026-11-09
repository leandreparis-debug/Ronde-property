import "server-only";

import { randomUUID } from "node:crypto";

import { sql } from "kysely";

import { type Trx, type UserRef, withSystem, withUser } from "@/server/db/context";
import { DEFAULT_PHOTO_CATEGORY, MAX_PHOTOS_PER_VISIT } from "@/server/domain/photos";
import { ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";

import type { PhotoPatch, PhotoRecord, PreparePhotoItem } from "./types";

export const PHOTO_CAP_MESSAGE = `Plafond de ${MAX_PHOTOS_PER_VISIT} photos par visite atteint.`;
export const NOT_EDITABLE_MESSAGE = "Cette visite n'est pas modifiable.";
export const COMPLETED_MESSAGE = "La visite est terminée : la photo n'a pas été ajoutée.";

/** Storage paths of a photo, to remove its objects. */
export interface PhotoPaths {
  id: string;
  storagePath: string;
  thumbPath: string | null;
}

/** Paths of the two objects of a photo. */
export function photoPaths(visitId: string, photoId: string): { main: string; thumb: string } {
  return { main: `${visitId}/${photoId}.jpg`, thumb: `${visitId}/${photoId}_thumb.jpg` };
}

function selectPhotos(trx: Trx) {
  return trx
    .selectFrom("photos as p")
    .leftJoin("profiles as pr", "pr.id", "p.created_by")
    .leftJoin("visit_zone_notes as n", (join) =>
      join.onRef("n.visit_id", "=", "p.visit_id").onRef("n.zone_key", "=", "p.zone_key"),
    )
    .select([
      "p.id",
      "p.visit_id",
      "p.storage_path",
      "p.thumb_path",
      "p.original_filename",
      "p.mime_type",
      "p.width",
      "p.height",
      "p.size_bytes",
      "p.caption",
      "p.category",
      "p.zone_key",
      "n.zone_label",
      "p.taken_at",
      "p.sort_order",
      "p.is_cover",
      "p.upload_status",
      "p.created_by",
      "pr.full_name as created_by_name",
      "p.created_at",
      "p.updated_at",
    ]);
}

type PhotoRow = Awaited<ReturnType<ReturnType<typeof selectPhotos>["execute"]>>[number];

function toRecord(row: PhotoRow): PhotoRecord {
  return {
    id: row.id,
    visitId: row.visit_id,
    storagePath: row.storage_path,
    thumbPath: row.thumb_path,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    width: row.width,
    height: row.height,
    sizeBytes: row.size_bytes === null ? null : Number(row.size_bytes),
    caption: row.caption,
    category: row.category,
    zoneKey: row.zone_key,
    zoneLabel: row.zone_label ?? null,
    takenAt: row.taken_at,
    sortOrder: row.sort_order,
    isCover: row.is_cover,
    uploadStatus: row.upload_status === "ready" ? "ready" : "pending",
    createdBy: row.created_by,
    createdByName: row.created_by_name ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function readyPhotos(trx: Trx, visitId: string): Promise<PhotoRecord[]> {
  const rows = await selectPhotos(trx)
    .where("p.visit_id", "=", visitId)
    .where("p.upload_status", "=", "ready")
    .orderBy("p.sort_order")
    .orderBy("p.created_at")
    .orderBy("p.id")
    .execute();
  return rows.map(toRecord);
}

async function photoById(trx: Trx, photoId: string): Promise<PhotoRecord> {
  const row = await selectPhotos(trx).where("p.id", "=", photoId).executeTakeFirst();
  if (!row) throw new NotFoundError("Photo introuvable.");
  return toRecord(row);
}

/** Serialises the writes of one visit (cover, order) without touching the visit row. */
async function lockVisit(trx: Trx, visitId: string): Promise<void> {
  await sql`select pg_advisory_xact_lock(hashtextextended(${visitId}, 0))`.execute(trx);
}

/**
 * Explains why a write on a pending photo touched no row: unknown (or invisible) photo,
 * already ready, visit completed, or user without the edit right.
 */
async function refusal(
  trx: Trx,
  photoId: string,
  options: { readyIsError: boolean },
): Promise<Error> {
  const row = await trx
    .selectFrom("photos as p")
    .innerJoin("visits as v", "v.id", "p.visit_id")
    .select(["p.upload_status", "v.status"])
    .where("p.id", "=", photoId)
    .executeTakeFirst();
  if (!row) return new NotFoundError("Photo introuvable.");
  if (row.upload_status === "ready" && options.readyIsError) {
    return new ValidationError("Photo déjà envoyée.");
  }
  if (row.status === "completed") return new ForbiddenError(COMPLETED_MESSAGE);
  return new ForbiddenError(NOT_EDITABLE_MESSAGE);
}

/** Renumbers the ready photos of a visit from 0, in the given order, in one statement. */
async function renumber(trx: Trx, visitId: string, orderedIds: string[]): Promise<void> {
  if (orderedIds.length === 0) return;
  await trx
    .updateTable("photos")
    .set({ sort_order: sql<number>`array_position(${sql.val(orderedIds)}::uuid[], id)::int - 1` })
    .where("visit_id", "=", visitId)
    .where("id", "in", orderedIds)
    .execute();
}

/**
 * Photos of a visit through `withUser` (RLS: readable with the visit, writable when
 * `can_edit_visit`). Every method that signs a URL later relies on the RLS outcome here:
 * `createPending` only succeeds when the user may edit the visit.
 */
export interface PhotoRepository {
  /** Ready photos, in display order. */
  list(visitId: string): Promise<PhotoRecord[]>;
  /** Ready photos by id (unknown or invisible ids are left out). */
  listByIds(photoIds: string[]): Promise<PhotoRecord[]>;
  /** Number of ready photos per zone key. */
  countByZone(visitId: string): Promise<Record<string, number>>;
  /** Inserts `pending` rows (cap of 500 checked, RLS checked) and returns them. */
  createPending(visitId: string, items: PreparePhotoItem[]): Promise<PhotoRecord[]>;
  /** A pending photo the user may still edit (touches the row under RLS), or throws. */
  findPendingForUpload(photoId: string): Promise<PhotoRecord>;
  /** Pending → ready; throws when the visit is no longer editable. */
  markReady(photoId: string): Promise<PhotoRecord>;
  update(photoId: string, patch: PhotoPatch): Promise<PhotoRecord>;
  /** Makes this photo the single cover of its visit (serialised per visit). */
  setCover(photoId: string): Promise<PhotoRecord[]>;
  /** Swaps the photo with its previous or next neighbour. */
  move(photoId: string, direction: "before" | "after"): Promise<PhotoRecord[]>;
  /** Deletes the row under RLS and returns its paths. */
  remove(photoId: string): Promise<PhotoPaths>;
  /** Deletes a pending row the user owns (queue item removed); `null` when absent. */
  discardPending(photoId: string): Promise<PhotoPaths | null>;
}

/** Kysely implementation of {@link PhotoRepository}. */
export function createPhotoRepository(user: UserRef): PhotoRepository {
  return {
    list(visitId) {
      return withUser(user, (trx) => readyPhotos(trx, visitId));
    },

    listByIds(photoIds) {
      if (photoIds.length === 0) return Promise.resolve([]);
      return withUser(user, async (trx) => {
        const rows = await selectPhotos(trx)
          .where("p.id", "in", photoIds)
          .where("p.upload_status", "=", "ready")
          .execute();
        return rows.map(toRecord);
      });
    },

    countByZone(visitId) {
      return withUser(user, async (trx) => {
        const rows = await trx
          .selectFrom("photos")
          .select(["zone_key", (eb) => eb.fn.countAll<number>().as("count")])
          .where("visit_id", "=", visitId)
          .where("upload_status", "=", "ready")
          .where("zone_key", "is not", null)
          .groupBy("zone_key")
          .execute();
        const counts: Record<string, number> = {};
        for (const row of rows) if (row.zone_key) counts[row.zone_key] = Number(row.count);
        return counts;
      });
    },

    createPending(visitId, items) {
      return withUser(user, async (trx) => {
        await lockVisit(trx, visitId);
        const existing = await trx
          .selectFrom("photos")
          .select([
            (eb) => eb.fn.countAll<number>().as("count"),
            (eb) => eb.fn.max("sort_order").as("max"),
          ])
          .where("visit_id", "=", visitId)
          .executeTakeFirstOrThrow();
        if (Number(existing.count) + items.length > MAX_PHOTOS_PER_VISIT) {
          throw new ValidationError(PHOTO_CAP_MESSAGE);
        }
        const start = (existing.max ?? -1) + 1;
        // Identifiers may come from the device (offline creation, UUID v7): accepted as they are.
        const ids = items.map((item) => item.id ?? randomUUID());
        const inserted = await trx
          .insertInto("photos")
          .values(
            items.map((item, index) => {
              const id = ids[index]!;
              const paths = photoPaths(visitId, id);
              return {
                id,
                visit_id: visitId,
                storage_path: paths.main,
                thumb_path: paths.thumb,
                original_filename: item.originalFilename,
                mime_type: "image/jpeg",
                width: item.width,
                height: item.height,
                size_bytes: item.sizeBytes,
                category: DEFAULT_PHOTO_CATEGORY,
                zone_key: item.zoneKey,
                taken_at: item.takenAt ? new Date(item.takenAt) : null,
                sort_order: start + index,
                is_cover: false,
                upload_status: "pending",
                created_by: user.id,
              };
            }),
          )
          .returning("id")
          .execute();
        if (inserted.length !== items.length) throw new ForbiddenError(NOT_EDITABLE_MESSAGE);
        const rows = await selectPhotos(trx).where("p.id", "in", ids).execute();
        const byId = new Map(rows.map((row) => [row.id, toRecord(row)]));
        return ids.map((id) => byId.get(id)!);
      });
    },

    findPendingForUpload(photoId) {
      return withUser(user, async (trx) => {
        // The update policy requires can_edit_visit: a reader cannot obtain upload URLs.
        const touched = await trx
          .updateTable("photos")
          .set({ updated_at: new Date() })
          .where("id", "=", photoId)
          .where("upload_status", "=", "pending")
          .returning("id")
          .executeTakeFirst();
        if (!touched) throw await refusal(trx, photoId, { readyIsError: true });
        return photoById(trx, photoId);
      });
    },

    markReady(photoId) {
      return withUser(user, async (trx) => {
        const updated = await trx
          .updateTable("photos")
          .set({ upload_status: "ready" })
          .where("id", "=", photoId)
          .where("upload_status", "=", "pending")
          .returning("id")
          .executeTakeFirst();
        if (!updated) {
          const exists = await trx
            .selectFrom("photos")
            .select("upload_status")
            .where("id", "=", photoId)
            .executeTakeFirst();
          if (exists?.upload_status === "ready") return photoById(trx, photoId);
          throw await refusal(trx, photoId, { readyIsError: false });
        }
        return photoById(trx, photoId);
      });
    },

    update(photoId, patch) {
      return withUser(user, async (trx) => {
        const values: Partial<{
          caption: string | null;
          category: string;
          zone_key: string | null;
        }> = {};
        if (patch.caption !== undefined) {
          const caption = patch.caption?.trim() ?? "";
          values.caption = caption === "" ? null : caption;
        }
        if (patch.category !== undefined) values.category = patch.category;
        if (patch.zoneKey !== undefined) values.zone_key = patch.zoneKey;
        if (Object.keys(values).length === 0) return photoById(trx, photoId);
        if (values.zone_key) {
          const { visitId } = await photoById(trx, photoId);
          const zone = await trx
            .selectFrom("visit_zone_notes")
            .select("id")
            .where("visit_id", "=", visitId)
            .where("zone_key", "=", values.zone_key)
            .executeTakeFirst();
          if (!zone) throw new ValidationError("Cette zone n'existe pas dans la visite.");
        }
        const result = await trx
          .updateTable("photos")
          .set(values)
          .where("id", "=", photoId)
          .where("upload_status", "=", "ready")
          .executeTakeFirst();
        if (Number(result.numUpdatedRows) === 0) {
          await photoById(trx, photoId);
          throw new ForbiddenError(NOT_EDITABLE_MESSAGE);
        }
        return photoById(trx, photoId);
      });
    },

    setCover(photoId) {
      return withUser(user, async (trx) => {
        const photo = await photoById(trx, photoId);
        if (photo.uploadStatus !== "ready") throw new ValidationError("Photo en cours d'envoi.");
        await lockVisit(trx, photo.visitId);
        await trx
          .updateTable("photos")
          .set({ is_cover: false })
          .where("visit_id", "=", photo.visitId)
          .where("is_cover", "=", true)
          .where("id", "<>", photoId)
          .execute();
        const result = await trx
          .updateTable("photos")
          .set({ is_cover: true })
          .where("id", "=", photoId)
          .executeTakeFirst();
        if (Number(result.numUpdatedRows) === 0) throw new ForbiddenError(NOT_EDITABLE_MESSAGE);
        return readyPhotos(trx, photo.visitId);
      });
    },

    move(photoId, direction) {
      return withUser(user, async (trx) => {
        const photo = await photoById(trx, photoId);
        await lockVisit(trx, photo.visitId);
        const ordered = (await readyPhotos(trx, photo.visitId)).map((p) => p.id);
        const index = ordered.indexOf(photoId);
        if (index === -1) throw new NotFoundError("Photo introuvable.");
        const target = direction === "before" ? index - 1 : index + 1;
        if (target >= 0 && target < ordered.length) {
          [ordered[index], ordered[target]] = [ordered[target]!, ordered[index]!];
          await renumber(trx, photo.visitId, ordered);
          const check = await trx
            .selectFrom("photos")
            .select("sort_order")
            .where("id", "=", photoId)
            .executeTakeFirstOrThrow();
          if (check.sort_order !== target) throw new ForbiddenError(NOT_EDITABLE_MESSAGE);
        }
        return readyPhotos(trx, photo.visitId);
      });
    },

    remove(photoId) {
      return withUser(user, async (trx) => {
        const deleted = await trx
          .deleteFrom("photos")
          .where("id", "=", photoId)
          .returning(["id", "storage_path", "thumb_path"])
          .executeTakeFirst();
        if (!deleted) {
          const exists = await trx
            .selectFrom("photos")
            .select("id")
            .where("id", "=", photoId)
            .executeTakeFirst();
          if (!exists) throw new NotFoundError("Photo introuvable.");
          throw new ForbiddenError(NOT_EDITABLE_MESSAGE);
        }
        return { id: deleted.id, storagePath: deleted.storage_path, thumbPath: deleted.thumb_path };
      });
    },

    discardPending(photoId) {
      return withUser(user, async (trx) => {
        const deleted = await trx
          .deleteFrom("photos")
          .where("id", "=", photoId)
          .where("upload_status", "=", "pending")
          .returning(["id", "storage_path", "thumb_path"])
          .executeTakeFirst();
        return deleted
          ? { id: deleted.id, storagePath: deleted.storage_path, thumbPath: deleted.thumb_path }
          : null;
      });
    },
  };
}

/**
 * Deletes the `pending` rows older than `maxAge` (24 h by default) and returns their paths so
 * that the service removes the objects. `service_role` only (SECURITY DEFINER function).
 */
export function purgeStalePendingRows(maxAge = "24 hours"): Promise<PhotoPaths[]> {
  return withSystem("photos.purge_stale_pending", (trx) =>
    purgeStalePendingPhotoRowsInTrx(trx, maxAge),
  );
}

/** Same as {@link purgeStalePendingRows}, inside a system transaction (scheduled purge). */
export async function purgeStalePendingPhotoRowsInTrx(
  trx: Trx,
  maxAge = "24 hours",
): Promise<PhotoPaths[]> {
  const { rows } = await sql<{
    id: string;
    storage_path: string;
    thumb_path: string | null;
  }>`select id, storage_path, thumb_path from private.purge_stale_pending_photos(${maxAge}::interval)`.execute(
    trx,
  );
  return rows.map((row) => ({
    id: row.id,
    storagePath: row.storage_path,
    thumbPath: row.thumb_path,
  }));
}

/** Number of ready photos linked to a zone (guard before removing the zone). */
export async function countPhotosOfZone(
  trx: Trx,
  visitId: string,
  zoneKey: string,
): Promise<number> {
  const row = await trx
    .selectFrom("photos")
    .select((eb) => eb.fn.countAll<number>().as("count"))
    .where("visit_id", "=", visitId)
    .where("zone_key", "=", zoneKey)
    .where("upload_status", "=", "ready")
    .executeTakeFirstOrThrow();
  return Number(row.count);
}
