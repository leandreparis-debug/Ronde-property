import "server-only";

import { randomUUID } from "node:crypto";

import { sql } from "kysely";

import { type Trx, type UserRef, withSystem, withUser } from "@/server/db/context";
import { roundCoordinate } from "@/server/domain/plans";
import { ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";

import type {
  MarkerRecord,
  PlanMimeType,
  PlanPageRecord,
  PlanRecord,
  PreparePageInput,
  PreparePlanInput,
} from "./types";

export const PLAN_NOT_EDITABLE_MESSAGE = "Vous ne pouvez pas modifier ce plan.";
export const PLAN_NOT_PENDING_MESSAGE = "Ce plan a déjà été importé.";
export const MARKER_NOT_EDITABLE_MESSAGE = "Cette visite n'est pas modifiable.";

/** Storage paths of a plan and its pages, to remove the objects. */
export interface PlanPaths {
  id: string;
  storagePath: string;
  pagePaths: string[];
}

const EXTENSIONS: Record<PlanMimeType, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
};

/** Paths of the objects of a plan inside the `site-plans` bucket. */
export function planPaths(siteId: string, planId: string, mimeType: PlanMimeType) {
  return {
    original: `${siteId}/${planId}/original.${EXTENSIONS[mimeType]}`,
    image: (page: number, mime: "image/png" | "image/jpeg") =>
      `${siteId}/${planId}/p${page}.${mime === "image/png" ? "png" : "jpg"}`,
    thumb: (page: number) => `${siteId}/${planId}/p${page}_thumb.jpg`,
  };
}

function selectPlans(trx: Trx) {
  return trx
    .selectFrom("site_plans as p")
    .leftJoin("profiles as pr", "pr.id", "p.uploaded_by")
    .select([
      "p.id",
      "p.site_id",
      "p.name",
      "p.storage_path",
      "p.mime_type",
      "p.page_count",
      "p.is_archived",
      "p.upload_status",
      "p.uploaded_by",
      "pr.full_name as uploaded_by_name",
      "p.created_at",
      "p.updated_at",
    ]);
}

type PlanRow = Awaited<ReturnType<ReturnType<typeof selectPlans>["execute"]>>[number];

function toPlan(row: PlanRow): PlanRecord {
  return {
    id: row.id,
    siteId: row.site_id,
    name: row.name,
    storagePath: row.storage_path,
    mimeType: row.mime_type as PlanMimeType,
    pageCount: row.page_count,
    isArchived: row.is_archived,
    uploadStatus: row.upload_status === "ready" ? "ready" : "pending",
    uploadedBy: row.uploaded_by,
    uploadedByName: row.uploaded_by_name ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function planById(trx: Trx, planId: string): Promise<PlanRecord> {
  const row = await selectPlans(trx).where("p.id", "=", planId).executeTakeFirst();
  if (!row) throw new NotFoundError("Plan introuvable.");
  return toPlan(row);
}

async function pagesOf(trx: Trx, planId: string): Promise<PlanPageRecord[]> {
  const rows = await trx
    .selectFrom("site_plan_pages")
    .select([
      "id",
      "plan_id",
      "page_number",
      "image_path",
      "thumb_path",
      "image_mime",
      "width",
      "height",
      "size_bytes",
    ])
    .where("plan_id", "=", planId)
    .orderBy("page_number")
    .execute();
  return rows.map((row) => ({
    id: row.id,
    planId: row.plan_id,
    pageNumber: row.page_number,
    imagePath: row.image_path,
    thumbPath: row.thumb_path,
    imageMime: row.image_mime === "image/png" ? "image/png" : "image/jpeg",
    width: row.width,
    height: row.height,
    sizeBytes: Number(row.size_bytes),
  }));
}

/** First-page thumbnail paths of several plans, keyed by plan id. */
async function firstThumbs(trx: Trx, planIds: string[]): Promise<Record<string, string>> {
  if (planIds.length === 0) return {};
  const rows = await trx
    .selectFrom("site_plan_pages")
    .select(["plan_id", "thumb_path"])
    .where("plan_id", "in", planIds)
    .where("page_number", "=", 1)
    .execute();
  return Object.fromEntries(rows.map((row) => [row.plan_id, row.thumb_path]));
}

/**
 * Plans of a site (through `withUser`: readable by every active user once ready, writable by
 * rt/admin while pending). Every signed URL is created by the service only for rows returned
 * here, under RLS.
 */
export interface PlanRepository {
  /** Ready plans of a site with their first-page thumbnail path. */
  listForSite(
    siteId: string,
    options?: { includeArchived?: boolean },
  ): Promise<Array<PlanRecord & { firstThumbPath: string | null }>>;
  /** Plan ids that carry at least one marker of the visit, with the count. */
  markerCountsForVisit(visitId: string): Promise<Record<string, number>>;
  getWithPages(planId: string): Promise<{ plan: PlanRecord; pages: PlanPageRecord[] }>;
  /** Inserts the pending row (RLS: rt/admin) and returns it. */
  createPending(siteId: string, input: PreparePlanInput): Promise<PlanRecord>;
  /** Inserts or replaces the given page rows of a pending plan (page numbers ≤ page_count). */
  addPages(
    planId: string,
    pages: PreparePageInput[],
  ): Promise<{ plan: PlanRecord; pages: PlanPageRecord[] }>;
  /** A pending plan the user may still edit (touched under RLS), with its pages. */
  findPendingForUpload(planId: string): Promise<{ plan: PlanRecord; pages: PlanPageRecord[] }>;
  /** Pending → ready (the trigger writes the audit entry). */
  markReady(planId: string): Promise<PlanRecord>;
  rename(planId: string, name: string): Promise<PlanRecord>;
  setArchived(planId: string, archived: boolean): Promise<PlanRecord>;
  /** Deletes a pending plan of the user (import cancelled); `null` when absent. */
  discardPending(planId: string): Promise<PlanPaths | null>;
}

/** Kysely implementation of {@link PlanRepository}. */
export function createPlanRepository(user: UserRef): PlanRepository {
  async function pendingOrThrow(trx: Trx, planId: string): Promise<PlanRecord> {
    const touched = await trx
      .updateTable("site_plans")
      .set({ updated_at: new Date() })
      .where("id", "=", planId)
      .where("upload_status", "=", "pending")
      .returning("id")
      .executeTakeFirst();
    if (!touched) {
      const plan = await planById(trx, planId);
      if (plan.uploadStatus === "ready") throw new ValidationError(PLAN_NOT_PENDING_MESSAGE);
      throw new ForbiddenError(PLAN_NOT_EDITABLE_MESSAGE);
    }
    return planById(trx, planId);
  }

  return {
    listForSite(siteId, options) {
      return withUser(user, async (trx) => {
        let query = selectPlans(trx)
          .where("p.site_id", "=", siteId)
          .where("p.upload_status", "=", "ready");
        if (!options?.includeArchived) query = query.where("p.is_archived", "=", false);
        const rows = await query.orderBy("p.is_archived").orderBy("p.name").execute();
        const thumbs = await firstThumbs(
          trx,
          rows.map((row) => row.id),
        );
        return rows.map((row) => ({ ...toPlan(row), firstThumbPath: thumbs[row.id] ?? null }));
      });
    },

    markerCountsForVisit(visitId) {
      return withUser(user, async (trx) => {
        const rows = await trx
          .selectFrom("plan_markers")
          .select(["plan_id", (eb) => eb.fn.countAll<number>().as("count")])
          .where("visit_id", "=", visitId)
          .groupBy("plan_id")
          .execute();
        return Object.fromEntries(rows.map((row) => [row.plan_id, Number(row.count)]));
      });
    },

    getWithPages(planId) {
      return withUser(user, async (trx) => ({
        plan: await planById(trx, planId),
        pages: await pagesOf(trx, planId),
      }));
    },

    createPending(siteId, input) {
      return withUser(user, async (trx) => {
        const id = randomUUID();
        const inserted = await trx
          .insertInto("site_plans")
          .values({
            id,
            site_id: siteId,
            name: input.name,
            storage_path: planPaths(siteId, id, input.mimeType).original,
            mime_type: input.mimeType,
            page_count: input.pageCount,
            upload_status: "pending",
            uploaded_by: user.id,
          })
          .returning("id")
          .executeTakeFirst();
        if (!inserted) throw new ForbiddenError(PLAN_NOT_EDITABLE_MESSAGE);
        return planById(trx, id);
      });
    },

    addPages(planId, pages) {
      return withUser(user, async (trx) => {
        const plan = await pendingOrThrow(trx, planId);
        const paths = planPaths(plan.siteId, plan.id, plan.mimeType);
        const numbers = pages.map((page) => page.pageNumber);
        if (new Set(numbers).size !== pages.length) throw new ValidationError("Pages en double.");
        if (numbers.some((n) => n > plan.pageCount)) {
          throw new ValidationError(`Ce plan compte ${plan.pageCount} page(s).`);
        }
        // Pages are prepared one at a time by the browser (one page in memory): replace only
        // the given page numbers, so that a retried page never duplicates its row.
        await trx
          .deleteFrom("site_plan_pages")
          .where("plan_id", "=", planId)
          .where("page_number", "in", numbers)
          .execute();
        await trx
          .insertInto("site_plan_pages")
          .values(
            pages.map((page) => ({
              plan_id: planId,
              page_number: page.pageNumber,
              image_path: paths.image(page.pageNumber, page.imageMime),
              thumb_path: paths.thumb(page.pageNumber),
              image_mime: page.imageMime,
              width: page.width,
              height: page.height,
              size_bytes: page.sizeBytes,
            })),
          )
          .execute();
        return { plan: await planById(trx, planId), pages: await pagesOf(trx, planId) };
      });
    },

    findPendingForUpload(planId) {
      return withUser(user, async (trx) => {
        const plan = await pendingOrThrow(trx, planId);
        return { plan, pages: await pagesOf(trx, planId) };
      });
    },

    markReady(planId) {
      return withUser(user, async (trx) => {
        const updated = await trx
          .updateTable("site_plans")
          .set({ upload_status: "ready" })
          .where("id", "=", planId)
          .where("upload_status", "=", "pending")
          .returning("id")
          .executeTakeFirst();
        if (!updated) {
          const plan = await planById(trx, planId);
          if (plan.uploadStatus === "ready") return plan;
          throw new ForbiddenError(PLAN_NOT_EDITABLE_MESSAGE);
        }
        return planById(trx, planId);
      });
    },

    rename(planId, name) {
      return withUser(user, async (trx) => {
        const result = await trx
          .updateTable("site_plans")
          .set({ name })
          .where("id", "=", planId)
          .executeTakeFirst();
        if (Number(result.numUpdatedRows) === 0) {
          await planById(trx, planId);
          throw new ForbiddenError(PLAN_NOT_EDITABLE_MESSAGE);
        }
        return planById(trx, planId);
      });
    },

    setArchived(planId, archived) {
      return withUser(user, async (trx) => {
        const result = await trx
          .updateTable("site_plans")
          .set({ is_archived: archived })
          .where("id", "=", planId)
          .executeTakeFirst();
        if (Number(result.numUpdatedRows) === 0) {
          await planById(trx, planId);
          throw new ForbiddenError(PLAN_NOT_EDITABLE_MESSAGE);
        }
        return planById(trx, planId);
      });
    },

    discardPending(planId) {
      return withUser(user, async (trx) => {
        const pages = await pagesOf(trx, planId);
        // RLS allows no delete on site_plans: a pending plan of the user is purged by the
        // system purge; here we only drop its pages and leave the row to the purge.
        const plan = await selectPlans(trx)
          .where("p.id", "=", planId)
          .where("p.upload_status", "=", "pending")
          .executeTakeFirst();
        if (!plan) return null;
        await trx.deleteFrom("site_plan_pages").where("plan_id", "=", planId).execute();
        return {
          id: plan.id,
          storagePath: plan.storage_path,
          pagePaths: pages.flatMap((page) => [page.imagePath, page.thumbPath]),
        };
      });
    },
  };
}

/**
 * Deletes the pending plans older than `maxAge` (24 h by default) and returns their paths so
 * that the service removes the objects. `service_role` only (SECURITY DEFINER function).
 */
export function purgeStalePendingPlanRows(maxAge = "24 hours"): Promise<PlanPaths[]> {
  return withSystem("plans.purge_stale_pending", async (trx) => {
    const { rows } = await sql<{
      id: string;
      storage_path: string;
      page_paths: string[];
    }>`select id, storage_path, page_paths from private.purge_stale_pending_plans(${maxAge}::interval)`.execute(
      trx,
    );
    return rows.map((row) => ({
      id: row.id,
      storagePath: row.storage_path,
      pagePaths: row.page_paths ?? [],
    }));
  });
}

/**
 * Deletes a pending plan row of the given user as the system, after the user cancelled its
 * import. The row is only removed when it is still pending and uploaded by that user.
 */
export function deleteCancelledPlanRow(user: UserRef, planId: string): Promise<boolean> {
  return withSystem("plans.discard_pending", async (trx) => {
    const result = await trx
      .deleteFrom("site_plans")
      .where("id", "=", planId)
      .where("upload_status", "=", "pending")
      .where("uploaded_by", "=", user.id)
      .executeTakeFirst();
    return Number(result.numDeletedRows) > 0;
  });
}

// ---------------------------------------------------------------------------------------------
// Markers
// ---------------------------------------------------------------------------------------------

function selectMarkers(trx: Trx) {
  return trx
    .selectFrom("plan_markers as m")
    .leftJoin("photos as ph", (join) =>
      join.onRef("ph.id", "=", "m.photo_id").on("ph.upload_status", "=", "ready"),
    )
    .select([
      "m.id",
      "m.visit_id",
      "m.plan_id",
      "m.page",
      "m.x",
      "m.y",
      "m.number",
      "m.label",
      "m.photo_id",
      "ph.thumb_path as photo_thumb_path",
      "ph.caption as photo_caption",
      "m.created_by",
      "m.created_at",
      "m.updated_at",
    ]);
}

type MarkerRow = Awaited<ReturnType<ReturnType<typeof selectMarkers>["execute"]>>[number];

function toMarker(row: MarkerRow): MarkerRecord {
  return {
    id: row.id,
    visitId: row.visit_id,
    planId: row.plan_id,
    page: row.page,
    x: Number(row.x),
    y: Number(row.y),
    number: row.number,
    label: row.label,
    photoId: row.photo_id,
    photoThumbPath: row.photo_thumb_path ?? null,
    photoCaption: row.photo_caption ?? null,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function markerById(trx: Trx, markerId: string): Promise<MarkerRecord> {
  const row = await selectMarkers(trx).where("m.id", "=", markerId).executeTakeFirst();
  if (!row) throw new NotFoundError("Repère introuvable.");
  return toMarker(row);
}

/**
 * Markers of a visit on the plans of its site (through `withUser`: readable with the visit,
 * writable when `can_edit_visit`). Numbers are **stable**: `number` is the highest number of
 * `(visit, plan)` plus one, taken under a per-plan lock, and never reused after a removal
 * (gaps are expected: captions and the report refer to them).
 *
 * Extension point (step 9): a reserve will be linkable to a marker (`reserve_id` column or a
 * join table); keep `create`/`update` as the single entry points so the sheet can set it.
 */
export interface MarkerRepository {
  listForVisit(visitId: string): Promise<MarkerRecord[]>;
  /**
   * Markers of the visit with the database time of the read (`now()`, start of the same
   * transaction: anything committed before it is in the list), so that the client can tell a marker deleted elsewhere (absent and older
   * than the snapshot) from one it created after the snapshot.
   */
  snapshotForVisit(visitId: string): Promise<{ records: MarkerRecord[]; snapshotAt: Date }>;
  listForVisitPlan(visitId: string, planId: string, page?: number): Promise<MarkerRecord[]>;
  create(
    visitId: string,
    input: {
      planId: string;
      page: number;
      x: number;
      y: number;
      label?: string | null;
      photoId?: string | null;
    },
  ): Promise<MarkerRecord>;
  move(markerId: string, x: number, y: number): Promise<MarkerRecord>;
  update(
    markerId: string,
    patch: { label?: string | null; photoId?: string | null },
  ): Promise<MarkerRecord>;
  remove(markerId: string): Promise<void>;
  /** Markers of the visit without a photo (incomplete point). */
  countWithoutPhoto(visitId: string): Promise<number>;
  /** Markers linked to the given photos, keyed by photo id, with the plan name. */
  byPhotoIds(
    photoIds: string[],
  ): Promise<
    Record<
      string,
      { markerId: string; number: number; planId: string; planName: string; page: number }
    >
  >;
}

/** Kysely implementation of {@link MarkerRepository}. */
export function createMarkerRepository(user: UserRef): MarkerRepository {
  return {
    listForVisit(visitId) {
      return withUser(user, async (trx) => {
        const rows = await selectMarkers(trx)
          .where("m.visit_id", "=", visitId)
          .orderBy("m.plan_id")
          .orderBy("m.number")
          .execute();
        return rows.map(toMarker);
      });
    },

    snapshotForVisit(visitId) {
      return withUser(user, async (trx) => {
        const rows = await selectMarkers(trx)
          .where("m.visit_id", "=", visitId)
          .orderBy("m.plan_id")
          .orderBy("m.number")
          .execute();
        const { rows: clock } = await sql<{ at: Date }>`select now() as at`.execute(trx);
        return { records: rows.map(toMarker), snapshotAt: clock[0]!.at };
      });
    },

    listForVisitPlan(visitId, planId, page) {
      return withUser(user, async (trx) => {
        let query = selectMarkers(trx)
          .where("m.visit_id", "=", visitId)
          .where("m.plan_id", "=", planId);
        if (page !== undefined) query = query.where("m.page", "=", page);
        const rows = await query.orderBy("m.number").execute();
        return rows.map(toMarker);
      });
    },

    create(visitId, input) {
      return withUser(user, async (trx) => {
        // Serialises the numbering of one (visit, plan) pair across connections.
        await sql`select pg_advisory_xact_lock(hashtextextended(${`${visitId}:${input.planId}`}, 0))`.execute(
          trx,
        );
        const max = await trx
          .selectFrom("plan_markers")
          .select((eb) => eb.fn.max("number").as("max"))
          .where("visit_id", "=", visitId)
          .where("plan_id", "=", input.planId)
          .executeTakeFirst();
        const number = (max?.max ?? 0) + 1;
        const inserted = await trx
          .insertInto("plan_markers")
          .values({
            visit_id: visitId,
            plan_id: input.planId,
            page: input.page,
            x: roundCoordinate(input.x),
            y: roundCoordinate(input.y),
            number,
            label: input.label?.trim() || null,
            photo_id: input.photoId ?? null,
            created_by: user.id,
          })
          .returning("id")
          .executeTakeFirst();
        if (!inserted) throw new ForbiddenError(MARKER_NOT_EDITABLE_MESSAGE);
        return markerById(trx, inserted.id);
      });
    },

    move(markerId, x, y) {
      return withUser(user, async (trx) => {
        const result = await trx
          .updateTable("plan_markers")
          .set({ x: roundCoordinate(x), y: roundCoordinate(y) })
          .where("id", "=", markerId)
          .executeTakeFirst();
        if (Number(result.numUpdatedRows) === 0) {
          await markerById(trx, markerId);
          throw new ForbiddenError(MARKER_NOT_EDITABLE_MESSAGE);
        }
        return markerById(trx, markerId);
      });
    },

    update(markerId, patch) {
      return withUser(user, async (trx) => {
        const values: Partial<{ label: string | null; photo_id: string | null }> = {};
        if (patch.label !== undefined) values.label = patch.label?.trim() || null;
        if (patch.photoId !== undefined) values.photo_id = patch.photoId;
        if (Object.keys(values).length === 0) return markerById(trx, markerId);
        const result = await trx
          .updateTable("plan_markers")
          .set(values)
          .where("id", "=", markerId)
          .executeTakeFirst();
        if (Number(result.numUpdatedRows) === 0) {
          await markerById(trx, markerId);
          throw new ForbiddenError(MARKER_NOT_EDITABLE_MESSAGE);
        }
        return markerById(trx, markerId);
      });
    },

    remove(markerId) {
      return withUser(user, async (trx) => {
        const result = await trx
          .deleteFrom("plan_markers")
          .where("id", "=", markerId)
          .executeTakeFirst();
        if (Number(result.numDeletedRows) === 0) {
          await markerById(trx, markerId);
          throw new ForbiddenError(MARKER_NOT_EDITABLE_MESSAGE);
        }
      });
    },

    countWithoutPhoto(visitId) {
      return withUser(user, async (trx) => {
        const row = await trx
          .selectFrom("plan_markers as m")
          .leftJoin("photos as ph", (join) =>
            join.onRef("ph.id", "=", "m.photo_id").on("ph.upload_status", "=", "ready"),
          )
          .select((eb) => eb.fn.countAll<number>().as("count"))
          .where("m.visit_id", "=", visitId)
          .where("ph.id", "is", null)
          .executeTakeFirstOrThrow();
        return Number(row.count);
      });
    },

    byPhotoIds(photoIds) {
      if (photoIds.length === 0) return Promise.resolve({});
      return withUser(user, async (trx) => {
        const rows = await trx
          .selectFrom("plan_markers as m")
          .innerJoin("site_plans as p", "p.id", "m.plan_id")
          .select(["m.id", "m.number", "m.plan_id", "m.page", "m.photo_id", "p.name"])
          .where("m.photo_id", "in", photoIds)
          .execute();
        const result: Record<
          string,
          { markerId: string; number: number; planId: string; planName: string; page: number }
        > = {};
        for (const row of rows) {
          if (row.photo_id) {
            result[row.photo_id] = {
              markerId: row.id,
              number: row.number,
              planId: row.plan_id,
              planName: row.name,
              page: row.page,
            };
          }
        }
        return result;
      });
    },
  };
}
