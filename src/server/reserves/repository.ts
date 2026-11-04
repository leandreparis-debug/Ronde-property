import "server-only";

import { sql } from "kysely";

import type { ReserveWrite } from "@/lib/reserves/schema";
import { type Trx, type UserRef, withUser } from "@/server/db/context";
import type {
  ReserveEventType,
  ReservePriority,
  ReserveStatus,
  ResponsibleKind,
  VisitStatus,
} from "@/server/domain/enums";
import { roundCoordinate } from "@/server/domain/plans";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";

import type { ReserveIncompleteCounts, ReserveMarkerRef, ResponsibleSuggestions } from "./types";

export const RESERVE_NOT_EDITABLE_MESSAGE =
  "Cette réserve n'est pas modifiable : sa visite n'est plus en cours ou vous n'y participez pas.";
export const RESERVE_NOT_FOUND_MESSAGE = "Réserve introuvable.";
const PHOTO_OTHER_VISIT_MESSAGE = "Une photo choisie n'appartient pas à cette visite.";

/** A reserve as read from `reserves_with_state`, with storage paths (signed by the service). */
export interface ReserveRecord {
  id: string;
  visitId: string;
  siteId: string;
  number: number;
  code: string;
  action: string;
  description: string | null;
  zoneKey: string | null;
  zoneLabel: string | null;
  priority: ReservePriority;
  responsibleKind: ResponsibleKind | null;
  responsibleProfileId: string | null;
  responsibleName: string | null;
  responsibleCompany: string | null;
  responsibleEmail: string | null;
  responsibleDisplayName: string | null;
  responsibleIsActive: boolean | null;
  dueDate: string | null;
  status: ReserveStatus;
  isOverdue: boolean;
  daysOverdue: number;
  closedAt: Date | null;
  closedByName: string | null;
  createdBy: string | null;
  photosCount: number;
  firstThumbPath: string | null;
  marker: ReserveMarkerRef | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Extra fields of the detail page. */
export interface ReserveDetailRecord extends ReserveRecord {
  createdByName: string | null;
  visitTitle: string;
  visitStatus: VisitStatus;
  visitDate: string;
  markerPlanName: string | null;
  photos: {
    id: string;
    caption: string | null;
    zoneLabel: string | null;
    storagePath: string;
    thumbPath: string | null;
  }[];
}

/** Raw history row. */
export interface ReserveEventRecord {
  id: string;
  type: ReserveEventType;
  fromStatus: ReserveStatus | null;
  toStatus: ReserveStatus | null;
  changes: Record<string, { old: unknown; new: unknown }>;
  actorName: string | null;
  createdAt: Date;
}

/** Open reserve of a site with its visit. */
export interface SiteReserveRecord extends ReserveRecord {
  visitTitle: string;
  visitDate: string;
}

/** Position of a reserve marker. */
export interface PlacementInput {
  planId: string;
  page: number;
  x: number;
  y: number;
}

function selectReserves(trx: Trx) {
  return trx
    .selectFrom("reserves_with_state as r")
    .leftJoin("visit_zone_notes as z", (join) =>
      join.onRef("z.visit_id", "=", "r.visit_id").onRef("z.zone_key", "=", "r.zone_key"),
    )
    .select([
      "r.id",
      "r.visit_id",
      "r.site_id",
      "r.number",
      "r.code",
      "r.action",
      "r.description",
      "r.zone_key",
      "z.zone_label",
      "r.priority",
      "r.responsible_kind",
      "r.responsible_profile_id",
      "r.responsible_name",
      "r.responsible_company",
      "r.responsible_email",
      "r.responsible_display_name",
      "r.responsible_is_active",
      "r.due_date",
      "r.status",
      "r.is_overdue",
      "r.days_overdue",
      "r.closed_at",
      "r.closed_by_name",
      "r.created_by",
      "r.photos_count",
      "r.first_thumb_path",
      "r.marker_id",
      "r.marker_plan_id",
      "r.marker_page",
      "r.version",
      "r.created_at",
      "r.updated_at",
    ])
    .where("r.deleted_at", "is", null);
}

type ReserveRow = Awaited<ReturnType<ReturnType<typeof selectReserves>["execute"]>>[number];

function toRecord(row: ReserveRow): ReserveRecord {
  return {
    id: row.id!,
    visitId: row.visit_id!,
    siteId: row.site_id!,
    number: row.number!,
    code: row.code!,
    action: row.action!,
    description: row.description,
    zoneKey: row.zone_key,
    zoneLabel: row.zone_label ?? null,
    priority: row.priority!,
    responsibleKind: row.responsible_kind,
    responsibleProfileId: row.responsible_profile_id,
    responsibleName: row.responsible_name,
    responsibleCompany: row.responsible_company,
    responsibleEmail: row.responsible_email,
    responsibleDisplayName: row.responsible_display_name,
    responsibleIsActive: row.responsible_is_active,
    dueDate: row.due_date,
    status: row.status!,
    isOverdue: row.is_overdue ?? false,
    daysOverdue: row.days_overdue ?? 0,
    closedAt: row.closed_at,
    closedByName: row.closed_by_name,
    createdBy: row.created_by,
    photosCount: row.photos_count ?? 0,
    firstThumbPath: row.first_thumb_path,
    marker:
      row.marker_id && row.marker_plan_id && row.marker_page !== null
        ? { id: row.marker_id, planId: row.marker_plan_id, page: row.marker_page }
        : null,
    version: row.version!,
    createdAt: row.created_at!,
    updatedAt: row.updated_at!,
  };
}

async function recordById(trx: Trx, id: string): Promise<ReserveRecord> {
  const row = await selectReserves(trx).where("r.id", "=", id).executeTakeFirst();
  if (!row) throw new NotFoundError(RESERVE_NOT_FOUND_MESSAGE);
  return toRecord(row);
}

async function detailById(trx: Trx, id: string): Promise<ReserveDetailRecord> {
  const base = await recordById(trx, id);
  const extra = await trx
    .selectFrom("reserves as r")
    .innerJoin("visits as v", "v.id", "r.visit_id")
    .leftJoin("profiles as cp", "cp.id", "r.created_by")
    .select(["v.title", "v.status", "v.visit_date", "cp.full_name as created_by_name"])
    .where("r.id", "=", id)
    .executeTakeFirstOrThrow();
  const photos = await trx
    .selectFrom("reserve_photos as l")
    .innerJoin("photos as p", "p.id", "l.photo_id")
    .leftJoin("visit_zone_notes as z", (join) =>
      join.onRef("z.visit_id", "=", "p.visit_id").onRef("z.zone_key", "=", "p.zone_key"),
    )
    .select(["p.id", "p.caption", "p.storage_path", "p.thumb_path", "z.zone_label"])
    .where("l.reserve_id", "=", id)
    .where("l.kind", "=", "defect")
    .where("p.upload_status", "=", "ready")
    .orderBy("l.created_at")
    .orderBy("p.sort_order")
    .orderBy("p.id")
    .execute();
  let markerPlanName: string | null = null;
  if (base.marker) {
    const plan = await trx
      .selectFrom("site_plans")
      .select("name")
      .where("id", "=", base.marker.planId)
      .executeTakeFirst();
    markerPlanName = plan?.name ?? null;
  }
  return {
    ...base,
    createdByName: extra.created_by_name ?? null,
    visitTitle: extra.title,
    visitStatus: extra.status,
    visitDate: extra.visit_date,
    markerPlanName,
    photos: photos.map((photo) => ({
      id: photo.id,
      caption: photo.caption,
      zoneLabel: photo.zone_label ?? null,
      storagePath: photo.storage_path,
      thumbPath: photo.thumb_path,
    })),
  };
}

function writeValues(input: ReserveWrite) {
  return {
    action: input.action,
    description: input.description,
    zone_key: input.zoneKey,
    priority: input.priority,
    due_date: input.dueDate,
    responsible_kind: input.responsibleKind,
    responsible_profile_id: input.responsibleProfileId,
    responsible_name: input.responsibleName,
    responsible_company: input.responsibleCompany,
    responsible_email: input.responsibleEmail,
  };
}

/** Checks that every photo is a ready photo of the visit (clear message before the trigger). */
async function assertVisitPhotos(trx: Trx, visitId: string, photoIds: string[]): Promise<void> {
  if (photoIds.length === 0) return;
  const rows = await trx
    .selectFrom("photos")
    .select("id")
    .where("id", "in", photoIds)
    .where("visit_id", "=", visitId)
    .where("upload_status", "=", "ready")
    .execute();
  if (rows.length !== new Set(photoIds).size) throw new ValidationError(PHOTO_OTHER_VISIT_MESSAGE);
}

/** Replaces the defect photos of a reserve by `photoIds` (order of the list kept). */
async function replaceDefectPhotos(
  trx: Trx,
  reserveId: string,
  visitId: string,
  photoIds: string[],
): Promise<void> {
  const unique = [...new Set(photoIds)];
  await assertVisitPhotos(trx, visitId, unique);
  const current = await trx
    .selectFrom("reserve_photos")
    .select("photo_id")
    .where("reserve_id", "=", reserveId)
    .where("kind", "=", "defect")
    .execute();
  const currentIds = new Set(current.map((row) => row.photo_id));
  const removed = [...currentIds].filter((id) => !unique.includes(id));
  if (removed.length > 0) {
    await trx
      .deleteFrom("reserve_photos")
      .where("reserve_id", "=", reserveId)
      .where("kind", "=", "defect")
      .where("photo_id", "in", removed)
      .execute();
  }
  const added = unique.filter((id) => !currentIds.has(id));
  for (const photoId of added) {
    await trx
      .insertInto("reserve_photos")
      .values({ reserve_id: reserveId, photo_id: photoId, kind: "defect" })
      .execute();
  }
}

/** Name of the last person who changed the reserve (conflict message). */
async function lastEditorName(trx: Trx, reserveId: string): Promise<string> {
  const row = await trx
    .selectFrom("reserve_events as e")
    .leftJoin("profiles as p", "p.id", "e.actor_id")
    .select("p.full_name")
    .where("e.reserve_id", "=", reserveId)
    .orderBy("e.seq", "desc")
    .limit(1)
    .executeTakeFirst();
  return row?.full_name ?? "un autre utilisateur";
}

/** Raised when the version sent by the client is stale; carries the current reserve. */
export class ReserveConflictError extends ConflictError {
  readonly current: ReserveDetailRecord;

  constructor(message: string, current: ReserveDetailRecord) {
    super(message);
    this.current = current;
  }
}

/**
 * Reserves of the visits, through `withUser` (RLS: readable with the visit, writable while the
 * visit is in progress by its creator, writer, participants or an admin). Numbering, closing
 * date, version and history are handled by the database triggers; deletion goes through the
 * `soft_delete_reserve` RPC, which also removes the reserve's marker.
 */
export interface ReserveRepository {
  listForVisit(visitId: string): Promise<ReserveRecord[]>;
  /** Open reserves of a site (all visits), most urgent first, with the counters. */
  listOpenForSite(
    siteId: string,
    limit: number,
  ): Promise<{ open: number; overdue: number; urgent: number; items: SiteReserveRecord[] }>;
  get(id: string): Promise<ReserveDetailRecord>;
  create(visitId: string, input: ReserveWrite, photoIds: string[]): Promise<ReserveDetailRecord>;
  /**
   * Optimistic update: `ReserveConflictError` (with the current reserve) when
   * `expectedVersion` is stale. `photoIds` (when given) replaces the defect photos.
   */
  update(
    id: string,
    input: ReserveWrite,
    expectedVersion: number,
    photoIds?: string[],
  ): Promise<ReserveDetailRecord>;
  setStatus(id: string, status: ReserveStatus): Promise<ReserveDetailRecord>;
  softDelete(id: string): Promise<void>;
  linkPhotos(id: string, photoIds: string[]): Promise<void>;
  unlinkPhoto(id: string, photoId: string): Promise<void>;
  /** Creates the reserve's marker, or moves it (another plan: the marker is recreated). */
  placeOnPlan(id: string, placement: PlacementInput): Promise<ReserveMarkerRef>;
  removeFromPlan(id: string): Promise<void>;
  /**
   * « Créer une réserve ici »: the existing marker (same visit, not yet linked) becomes the
   * reserve's marker; the reserve must not be placed yet.
   */
  attachMarker(id: string, markerId: string): Promise<ReserveMarkerRef>;
  /** Events in order, with the names of the profiles and the zone labels they mention. */
  history(id: string): Promise<{
    events: ReserveEventRecord[];
    profileNames: Record<string, string>;
    zoneLabels: Record<string, string>;
  }>;
  suggestions(siteId: string): Promise<ResponsibleSuggestions>;
  incompleteCounts(visitId: string): Promise<ReserveIncompleteCounts>;
  /** Reserves (not deleted) linked to the given photos, keyed by photo id. */
  byPhotoIds(photoIds: string[]): Promise<Record<string, { reserveId: string; code: string }[]>>;
}

/** Kysely implementation of {@link ReserveRepository}. */
export function createReserveRepository(user: UserRef): ReserveRepository {
  async function createMarker(
    trx: Trx,
    reserve: ReserveRecord,
    placement: PlacementInput,
  ): Promise<ReserveMarkerRef> {
    // Same numbering rule as the other markers (stable numbers, per-plan lock).
    await sql`select pg_advisory_xact_lock(hashtextextended(${`${reserve.visitId}:${placement.planId}`}, 0))`.execute(
      trx,
    );
    const max = await trx
      .selectFrom("plan_markers")
      .select((eb) => eb.fn.max("number").as("max"))
      .where("visit_id", "=", reserve.visitId)
      .where("plan_id", "=", placement.planId)
      .executeTakeFirst();
    const inserted = await trx
      .insertInto("plan_markers")
      .values({
        visit_id: reserve.visitId,
        plan_id: placement.planId,
        page: placement.page,
        x: roundCoordinate(placement.x),
        y: roundCoordinate(placement.y),
        number: (max?.max ?? 0) + 1,
        label: null,
        photo_id: null,
        reserve_id: reserve.id,
        created_by: user.id,
      })
      .returning(["id", "plan_id", "page"])
      .executeTakeFirst();
    if (!inserted) throw new ForbiddenError(RESERVE_NOT_EDITABLE_MESSAGE);
    return { id: inserted.id, planId: inserted.plan_id, page: inserted.page };
  }

  return {
    listForVisit(visitId) {
      return withUser(user, async (trx) => {
        const rows = await selectReserves(trx)
          .where("r.visit_id", "=", visitId)
          .orderBy("r.number")
          .execute();
        return rows.map(toRecord);
      });
    },

    listOpenForSite(siteId, limit) {
      return withUser(user, async (trx) => {
        const counts = await trx
          .selectFrom("reserves_with_state as r")
          .select((eb) => [
            eb.fn.countAll<number>().as("open"),
            eb.fn.count<number>("r.id").filterWhere("r.is_overdue", "=", true).as("overdue"),
            eb.fn.count<number>("r.id").filterWhere("r.priority", "=", "urgent").as("urgent"),
          ])
          .where("r.site_id", "=", siteId)
          .where("r.deleted_at", "is", null)
          .where("r.status", "<>", "done")
          .executeTakeFirstOrThrow();
        const rows = await selectReserves(trx)
          .innerJoin("visits as v", "v.id", "r.visit_id")
          .select(["v.title as visit_title", "v.visit_date"])
          .where("r.site_id", "=", siteId)
          .where("r.status", "<>", "done")
          .orderBy("r.is_overdue", "desc")
          .orderBy(
            sql`case r.priority when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end`,
          )
          .orderBy(sql`r.due_date asc nulls last`)
          .orderBy("r.number")
          .limit(limit)
          .execute();
        return {
          open: Number(counts.open),
          overdue: Number(counts.overdue),
          urgent: Number(counts.urgent),
          items: rows.map((row) => ({
            ...toRecord(row),
            visitTitle: row.visit_title,
            visitDate: row.visit_date,
          })),
        };
      });
    },

    get(id) {
      return withUser(user, (trx) => detailById(trx, id));
    },

    create(visitId, input, photoIds) {
      return withUser(user, async (trx) => {
        const inserted = await trx
          .insertInto("reserves")
          .values({ visit_id: visitId, ...writeValues(input), created_by: user.id })
          .returning("id")
          .executeTakeFirst();
        if (!inserted) throw new ForbiddenError(RESERVE_NOT_EDITABLE_MESSAGE);
        if (photoIds.length > 0) {
          await replaceDefectPhotos(trx, inserted.id, visitId, photoIds);
        }
        return detailById(trx, inserted.id);
      });
    },

    update(id, input, expectedVersion, photoIds) {
      return withUser(user, async (trx) => {
        const updated = await trx
          .updateTable("reserves")
          .set(writeValues(input))
          .where("id", "=", id)
          .where("version", "=", expectedVersion)
          .where("deleted_at", "is", null)
          .returning(["id", "visit_id"])
          .executeTakeFirst();
        if (!updated) {
          const current = await trx
            .selectFrom("reserves")
            .select(["version", "deleted_at"])
            .where("id", "=", id)
            .executeTakeFirst();
          if (!current || current.deleted_at) throw new NotFoundError(RESERVE_NOT_FOUND_MESSAGE);
          if (current.version !== expectedVersion) {
            const name = await lastEditorName(trx, id);
            throw new ReserveConflictError(
              `Cette réserve a été modifiée entre-temps par ${name}. Votre saisie est conservée : comparez avec la version actuelle puis enregistrez à nouveau.`,
              await detailById(trx, id),
            );
          }
          throw new ForbiddenError(RESERVE_NOT_EDITABLE_MESSAGE);
        }
        if (photoIds) await replaceDefectPhotos(trx, id, updated.visit_id, photoIds);
        return detailById(trx, id);
      });
    },

    setStatus(id, status) {
      return withUser(user, async (trx) => {
        const updated = await trx
          .updateTable("reserves")
          .set({ status })
          .where("id", "=", id)
          .where("deleted_at", "is", null)
          .returning("id")
          .executeTakeFirst();
        if (!updated) {
          await recordById(trx, id);
          throw new ForbiddenError(RESERVE_NOT_EDITABLE_MESSAGE);
        }
        return detailById(trx, id);
      });
    },

    softDelete(id) {
      return withUser(user, async (trx) => {
        await sql`select id from public.soft_delete_reserve(${id}::uuid)`.execute(trx);
      });
    },

    linkPhotos(id, photoIds) {
      return withUser(user, async (trx) => {
        const reserve = await recordById(trx, id);
        const current = await trx
          .selectFrom("reserve_photos")
          .select("photo_id")
          .where("reserve_id", "=", id)
          .where("kind", "=", "defect")
          .execute();
        await replaceDefectPhotos(trx, id, reserve.visitId, [
          ...current.map((row) => row.photo_id),
          ...photoIds,
        ]);
      });
    },

    unlinkPhoto(id, photoId) {
      return withUser(user, async (trx) => {
        const result = await trx
          .deleteFrom("reserve_photos")
          .where("reserve_id", "=", id)
          .where("photo_id", "=", photoId)
          .where("kind", "=", "defect")
          .executeTakeFirst();
        if (Number(result.numDeletedRows) === 0) {
          await recordById(trx, id);
          throw new ForbiddenError(RESERVE_NOT_EDITABLE_MESSAGE);
        }
      });
    },

    placeOnPlan(id, placement) {
      return withUser(user, async (trx) => {
        const reserve = await recordById(trx, id);
        if (reserve.marker && reserve.marker.planId === placement.planId) {
          const moved = await trx
            .updateTable("plan_markers")
            .set({
              page: placement.page,
              x: roundCoordinate(placement.x),
              y: roundCoordinate(placement.y),
            })
            .where("id", "=", reserve.marker.id)
            .returning(["id", "plan_id", "page"])
            .executeTakeFirst();
          if (!moved) throw new ForbiddenError(RESERVE_NOT_EDITABLE_MESSAGE);
          return { id: moved.id, planId: moved.plan_id, page: moved.page };
        }
        if (reserve.marker) {
          const removed = await trx
            .deleteFrom("plan_markers")
            .where("id", "=", reserve.marker.id)
            .executeTakeFirst();
          if (Number(removed.numDeletedRows) === 0) {
            throw new ForbiddenError(RESERVE_NOT_EDITABLE_MESSAGE);
          }
        }
        return createMarker(trx, reserve, placement);
      });
    },

    removeFromPlan(id) {
      return withUser(user, async (trx) => {
        const reserve = await recordById(trx, id);
        if (!reserve.marker) return;
        const removed = await trx
          .deleteFrom("plan_markers")
          .where("id", "=", reserve.marker.id)
          .executeTakeFirst();
        if (Number(removed.numDeletedRows) === 0) {
          throw new ForbiddenError(RESERVE_NOT_EDITABLE_MESSAGE);
        }
      });
    },

    attachMarker(id, markerId) {
      return withUser(user, async (trx) => {
        const reserve = await recordById(trx, id);
        if (reserve.marker) {
          throw new ValidationError("Cette réserve est déjà placée sur un plan.");
        }
        const linked = await trx
          .updateTable("plan_markers")
          .set({ reserve_id: id })
          .where("id", "=", markerId)
          .where("visit_id", "=", reserve.visitId)
          .where("reserve_id", "is", null)
          .returning(["id", "plan_id", "page"])
          .executeTakeFirst();
        if (!linked) {
          const marker = await trx
            .selectFrom("plan_markers")
            .select(["visit_id", "reserve_id"])
            .where("id", "=", markerId)
            .executeTakeFirst();
          if (marker && marker.visit_id === reserve.visitId && marker.reserve_id === null) {
            throw new ForbiddenError(RESERVE_NOT_EDITABLE_MESSAGE);
          }
          throw new ValidationError("Ce repère est introuvable ou déjà lié à une réserve.");
        }
        return { id: linked.id, planId: linked.plan_id, page: linked.page };
      });
    },

    history(id) {
      return withUser(user, async (trx) => {
        await recordById(trx, id);
        const rows = await trx
          .selectFrom("reserve_events as e")
          .leftJoin("profiles as p", "p.id", "e.actor_id")
          .select([
            "e.id",
            "e.event_type",
            "e.from_status",
            "e.to_status",
            "e.changes",
            "p.full_name",
            "e.created_at",
          ])
          .where("e.reserve_id", "=", id)
          .orderBy("e.seq")
          .execute();
        const events = rows.map((row) => ({
          id: row.id,
          type: row.event_type,
          fromStatus: row.from_status,
          toStatus: row.to_status,
          changes: (row.changes ?? {}) as Record<string, { old: unknown; new: unknown }>,
          actorName: row.full_name ?? null,
          createdAt: row.created_at,
        }));
        const profileIds = new Set<string>();
        for (const event of events) {
          const change = event.changes.responsible_profile_id;
          for (const value of [change?.old, change?.new]) {
            if (typeof value === "string") profileIds.add(value);
          }
        }
        const profiles =
          profileIds.size > 0
            ? await trx
                .selectFrom("profiles")
                .select(["id", "full_name"])
                .where("id", "in", [...profileIds])
                .execute()
            : [];
        const zones = await trx
          .selectFrom("visit_zone_notes as z")
          .innerJoin("reserves as r", "r.visit_id", "z.visit_id")
          .select(["z.zone_key", "z.zone_label"])
          .where("r.id", "=", id)
          .execute();
        return {
          events,
          profileNames: Object.fromEntries(profiles.map((p) => [p.id, p.full_name])),
          zoneLabels: Object.fromEntries(zones.map((z) => [z.zone_key, z.zone_label])),
        };
      });
    },

    suggestions(siteId) {
      return withUser(user, async (trx) => {
        const internal = await trx
          .selectFrom("profiles")
          .select(["id", "full_name"])
          .where("is_active", "=", true)
          .orderBy("full_name")
          .execute();
        const external = await trx
          .selectFrom("reserves")
          .select(["responsible_company", "responsible_name"])
          .select((eb) => eb.fn.max("updated_at").as("last_used"))
          .where("site_id", "=", siteId)
          .where("responsible_kind", "=", "external")
          .where("deleted_at", "is", null)
          .where("responsible_name", "is not", null)
          .groupBy(["responsible_company", "responsible_name"])
          .orderBy("last_used", "desc")
          .limit(10)
          .execute();
        return {
          internal: internal.map((row) => ({ id: row.id, fullName: row.full_name })),
          external: external.map((row) => ({
            company: row.responsible_company,
            name: row.responsible_name!,
          })),
        };
      });
    },

    incompleteCounts(visitId) {
      return withUser(user, async (trx) => {
        const row = await trx
          .selectFrom("reserves_with_state as r")
          .select((eb) => [
            eb.fn.count<number>("r.id").filterWhere("r.responsible_kind", "is", null).as("no_resp"),
            eb.fn.count<number>("r.id").filterWhere("r.due_date", "is", null).as("no_due"),
            eb.fn
              .count<number>("r.id")
              .filterWhere((w) =>
                w.and([w("r.priority", "=", "urgent"), w("r.photos_count", "=", 0)]),
              )
              .as("urgent_no_photo"),
          ])
          .where("r.visit_id", "=", visitId)
          .where("r.deleted_at", "is", null)
          .where("r.status", "<>", "done")
          .executeTakeFirstOrThrow();
        return {
          withoutResponsible: Number(row.no_resp),
          withoutDueDate: Number(row.no_due),
          urgentWithoutPhoto: Number(row.urgent_no_photo),
        };
      });
    },

    byPhotoIds(photoIds) {
      if (photoIds.length === 0) return Promise.resolve({});
      return withUser(user, async (trx) => {
        const rows = await trx
          .selectFrom("reserve_photos as l")
          .innerJoin("reserves_with_state as r", "r.id", "l.reserve_id")
          .select(["l.photo_id", "r.id", "r.code", "r.number"])
          .where("l.photo_id", "in", photoIds)
          .where("r.deleted_at", "is", null)
          .orderBy("r.number")
          .execute();
        const result: Record<string, { reserveId: string; code: string }[]> = {};
        for (const row of rows) {
          (result[row.photo_id] ??= []).push({ reserveId: row.id!, code: row.code! });
        }
        return result;
      });
    },
  };
}
