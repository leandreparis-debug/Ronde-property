import "server-only";

import { randomUUID } from "node:crypto";

import { sql } from "kysely";

import type { ReportOptions } from "@/lib/report/options";
import { type Trx, type UserRef, withSystem, withUser } from "@/server/db/context";
import type {
  ReservePriority,
  ReserveStatus,
  VisitReason,
  VisitStatus,
  VisitType,
} from "@/server/domain/enums";
import { ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";

export const REPORT_NOT_PENDING_MESSAGE = "Ce rapport est déjà enregistré.";

/** A report row (pending or ready). */
export interface ReportRecord {
  id: string;
  visitId: string;
  storagePath: string;
  number: number;
  fileName: string;
  isDraft: boolean;
  uploadStatus: "pending" | "ready";
  sizeBytes: number | null;
  pageCount: number | null;
  options: unknown;
  generatedBy: string | null;
  generatedByName: string | null;
  generatedAt: Date;
}

/** Raw data of a report, before the URLs are signed (no e-mail is read). */
export interface ReportRawData {
  visit: {
    id: string;
    title: string;
    type: VisitType;
    reason: VisitReason;
    status: VisitStatus;
    visitDate: string;
    subject: string | null;
    completedAt: Date | null;
    writerName: string | null;
    site: {
      code: string;
      name: string;
      address: string | null;
      postalCode: string | null;
      city: string | null;
    };
  };
  participants: Array<{
    fullName: string;
    company: string | null;
    jobTitle: string | null;
    isPresent: boolean;
  }>;
  zones: Array<{ key: string; label: string; content: string }>;
  photos: Array<{
    id: string;
    zoneKey: string | null;
    caption: string | null;
    category: string | null;
    isCover: boolean;
    takenAt: Date | null;
    sortOrder: number;
    createdAt: Date;
    storagePath: string;
    width: number | null;
    height: number | null;
  }>;
  markers: Array<{
    id: string;
    planId: string;
    page: number;
    x: number;
    y: number;
    number: number;
    label: string | null;
    photoId: string | null;
    reserveId: string | null;
  }>;
  plans: Array<{
    id: string;
    name: string;
    isArchived: boolean;
    pages: Array<{ pageNumber: number; imagePath: string; width: number; height: number }>;
  }>;
  reserves: Array<{
    id: string;
    number: number;
    code: string;
    action: string;
    description: string | null;
    zoneKey: string | null;
    priority: ReservePriority;
    status: ReserveStatus;
    dueDate: string | null;
    isOverdue: boolean;
    daysOverdue: number;
    responsibleKind: "internal" | "external" | null;
    responsibleName: string | null;
    responsibleCompany: string | null;
    closedAt: Date | null;
    closedByName: string | null;
    markerId: string | null;
  }>;
  reservePhotos: Array<{ reserveId: string; photoId: string }>;
  generatedByName: string;
}

function selectReports(trx: Trx) {
  return trx
    .selectFrom("reports as r")
    .leftJoin("profiles as p", "p.id", "r.generated_by")
    .select([
      "r.id",
      "r.visit_id",
      "r.storage_path",
      "r.number",
      "r.file_name",
      "r.is_draft",
      "r.upload_status",
      "r.size_bytes",
      "r.page_count",
      "r.options",
      "r.generated_by",
      "p.full_name as generated_by_name",
      "r.generated_at",
    ]);
}

type ReportRow = Awaited<ReturnType<ReturnType<typeof selectReports>["execute"]>>[number];

function toRecord(row: ReportRow): ReportRecord {
  return {
    id: row.id,
    visitId: row.visit_id,
    storagePath: row.storage_path,
    number: row.number,
    fileName: row.file_name,
    isDraft: row.is_draft,
    uploadStatus: row.upload_status === "ready" ? "ready" : "pending",
    sizeBytes: row.size_bytes === null ? null : Number(row.size_bytes),
    pageCount: row.page_count,
    options: row.options,
    generatedBy: row.generated_by,
    generatedByName: row.generated_by_name ?? null,
    generatedAt: row.generated_at,
  };
}

/** Reads everything a report prints, in the transaction (RLS of the user). */
async function readRawData(trx: Trx, user: UserRef, visitId: string): Promise<ReportRawData> {
  const visit = await trx
    .selectFrom("visits as v")
    .innerJoin("sites as s", "s.id", "v.site_id")
    .leftJoin("profiles as w", "w.id", "v.writer_id")
    .select([
      "v.id",
      "v.title",
      "v.type",
      "v.reason",
      "v.status",
      "v.visit_date",
      "v.subject",
      "v.completed_at",
      "w.full_name as writer_name",
      "s.warehouse_code",
      "s.name as site_name",
      "s.address",
      "s.postal_code",
      "s.city",
    ])
    .where("v.id", "=", visitId)
    .where("v.deleted_at", "is", null)
    .executeTakeFirst();
  if (!visit) throw new NotFoundError("Visite introuvable.");

  const [participants, zones, photos, markers, reserves, reservePhotos, me] = await Promise.all([
    // E-mails are never read: the report is sent outside the company.
    trx
      .selectFrom("visit_participants")
      .select(["full_name", "company", "job_title", "is_present"])
      .where("visit_id", "=", visitId)
      .orderBy("sort_order")
      .orderBy("created_at")
      .execute(),
    trx
      .selectFrom("visit_zone_notes")
      .select(["zone_key", "zone_label", "content"])
      .where("visit_id", "=", visitId)
      .orderBy("sort_order")
      .orderBy("zone_key")
      .execute(),
    trx
      .selectFrom("photos")
      .select([
        "id",
        "zone_key",
        "caption",
        "category",
        "is_cover",
        "taken_at",
        "sort_order",
        "created_at",
        "storage_path",
        "width",
        "height",
      ])
      .where("visit_id", "=", visitId)
      .where("upload_status", "=", "ready")
      .orderBy("sort_order")
      .orderBy("created_at")
      .execute(),
    trx
      .selectFrom("plan_markers")
      .select(["id", "plan_id", "page", "x", "y", "number", "label", "photo_id", "reserve_id"])
      .where("visit_id", "=", visitId)
      .orderBy("plan_id")
      .orderBy("number")
      .execute(),
    trx
      .selectFrom("reserves_with_state")
      .select([
        "id",
        "number",
        "code",
        "action",
        "description",
        "zone_key",
        "priority",
        "status",
        "due_date",
        "is_overdue",
        "days_overdue",
        "responsible_kind",
        "responsible_display_name",
        "responsible_name",
        "responsible_company",
        "closed_at",
        "closed_by_name",
        "marker_id",
      ])
      .where("visit_id", "=", visitId)
      .where("deleted_at", "is", null)
      .orderBy("number")
      .execute(),
    trx
      .selectFrom("reserve_photos as l")
      .innerJoin("reserves as r", "r.id", "l.reserve_id")
      .select(["l.reserve_id", "l.photo_id"])
      .where("r.visit_id", "=", visitId)
      .where("r.deleted_at", "is", null)
      .where("l.kind", "=", "defect")
      .execute(),
    trx.selectFrom("profiles").select("full_name").where("id", "=", user.id).executeTakeFirst(),
  ]);

  // Plans used by the visit (archived included), with the pages that carry markers.
  const planIds = [...new Set(markers.map((marker) => marker.plan_id))];
  const [plans, pages] =
    planIds.length > 0
      ? await Promise.all([
          trx
            .selectFrom("site_plans")
            .select(["id", "name", "is_archived", "created_at"])
            .where("id", "in", planIds)
            .where("upload_status", "=", "ready")
            .orderBy("created_at")
            .orderBy("name")
            .execute(),
          trx
            .selectFrom("site_plan_pages")
            .select(["plan_id", "page_number", "image_path", "width", "height"])
            .where("plan_id", "in", planIds)
            .orderBy("page_number")
            .execute(),
        ])
      : [[], []];

  return {
    visit: {
      id: visit.id,
      title: visit.title,
      type: visit.type,
      reason: visit.reason,
      status: visit.status,
      visitDate: visit.visit_date,
      subject: visit.subject,
      completedAt: visit.completed_at,
      writerName: visit.writer_name ?? null,
      site: {
        code: visit.warehouse_code,
        name: visit.site_name,
        address: visit.address,
        postalCode: visit.postal_code,
        city: visit.city,
      },
    },
    participants: participants.map((p) => ({
      fullName: p.full_name,
      company: p.company,
      jobTitle: p.job_title,
      isPresent: p.is_present,
    })),
    zones: zones.map((z) => ({ key: z.zone_key, label: z.zone_label, content: z.content })),
    photos: photos.map((p) => ({
      id: p.id,
      zoneKey: p.zone_key,
      caption: p.caption,
      category: p.category,
      isCover: p.is_cover,
      takenAt: p.taken_at,
      sortOrder: p.sort_order,
      createdAt: p.created_at,
      storagePath: p.storage_path,
      width: p.width,
      height: p.height,
    })),
    markers: markers.map((m) => ({
      id: m.id,
      planId: m.plan_id,
      page: m.page,
      x: Number(m.x),
      y: Number(m.y),
      number: m.number,
      label: m.label,
      photoId: m.photo_id,
      reserveId: m.reserve_id,
    })),
    plans: plans.map((plan) => ({
      id: plan.id,
      name: plan.name,
      isArchived: plan.is_archived,
      pages: pages
        .filter((page) => page.plan_id === plan.id)
        .map((page) => ({
          pageNumber: page.page_number,
          imagePath: page.image_path,
          width: page.width,
          height: page.height,
        })),
    })),
    reserves: reserves.map((r) => ({
      id: r.id!,
      number: r.number!,
      code: r.code!,
      action: r.action!,
      description: r.description,
      zoneKey: r.zone_key,
      priority: r.priority!,
      status: r.status!,
      dueDate: r.due_date,
      isOverdue: r.is_overdue ?? false,
      daysOverdue: r.days_overdue ?? 0,
      responsibleKind: r.responsible_kind,
      // Internal: the profile name; external: name and company. Never the e-mail.
      responsibleName:
        r.responsible_kind === "internal"
          ? (r.responsible_display_name ?? null)
          : r.responsible_name,
      responsibleCompany: r.responsible_kind === "external" ? r.responsible_company : null,
      closedAt: r.closed_at,
      closedByName: r.closed_by_name,
      markerId: r.marker_id,
    })),
    reservePhotos: reservePhotos.map((l) => ({ reserveId: l.reserve_id, photoId: l.photo_id })),
    generatedByName: me?.full_name ?? "Utilisateur RONDE",
  };
}

/**
 * Reports of the visits through `withUser`: insertion by any active user who can read the
 * visit (rt, admin, direction), confirmation by its author only (pending → ready), never
 * modified afterwards. Numbering, file name and draft flag come from the insert trigger.
 */
export interface ReportRepository {
  /** Data of a report without reserving a number (`report.number` is the next one). */
  readData(visitId: string): Promise<{ raw: ReportRawData; nextNumber: number; isDraft: boolean }>;
  /** Reserves a pending report row and reads its data in the same transaction. */
  start(
    visitId: string,
    options: ReportOptions,
  ): Promise<{ report: ReportRecord; raw: ReportRawData }>;
  /** The caller's own pending report (to sign the upload or confirm it). */
  findOwnPending(reportId: string): Promise<ReportRecord>;
  markReady(reportId: string, sizeBytes: number, pageCount: number): Promise<ReportRecord>;
  listReady(visitId: string): Promise<ReportRecord[]>;
  findReady(reportId: string): Promise<ReportRecord>;
  /** Options of the latest ready report of the visit (memorised for the next one). */
  lastOptions(visitId: string): Promise<unknown | null>;
  /** Photos and plan pages of the visit readable by the user, for URL renewal. */
  imagePaths(
    visitId: string,
    photoIds: string[],
    pages: Array<{ planId: string; pageNumber: number }>,
  ): Promise<{ photos: Record<string, string>; pages: Record<string, string> }>;
}

/** Kysely implementation of {@link ReportRepository}. */
export function createReportRepository(user: UserRef): ReportRepository {
  return {
    readData(visitId) {
      return withUser(user, async (trx) => {
        const raw = await readRawData(trx, user, visitId);
        const max = await trx
          .selectFrom("reports")
          .select((eb) => eb.fn.max("number").as("max"))
          .where("visit_id", "=", visitId)
          .executeTakeFirst();
        return {
          raw,
          nextNumber: (max?.max ?? 0) + 1,
          isDraft: raw.visit.status !== "completed",
        };
      });
    },

    start(visitId, options) {
      return withUser(user, async (trx) => {
        const id = randomUUID();
        const inserted = await trx
          .insertInto("reports")
          .values({
            id,
            visit_id: visitId,
            storage_path: `${visitId}/${id}.pdf`,
            options: JSON.stringify(options),
            generated_by: user.id,
            // Replaced by the trigger reports_before_insert (number per visit, file name).
            number: 1,
            file_name: "RONDE_pending_1970-01-01_1.pdf",
          })
          .returning("id")
          .executeTakeFirst();
        if (!inserted) throw new ForbiddenError("Vous ne pouvez pas générer ce rapport.");
        const row = await selectReports(trx).where("r.id", "=", id).executeTakeFirstOrThrow();
        // Same transaction: the data is frozen at the moment the number is taken.
        const raw = await readRawData(trx, user, visitId);
        return { report: toRecord(row), raw };
      });
    },

    findOwnPending(reportId) {
      return withUser(user, async (trx) => {
        const row = await selectReports(trx)
          .where("r.id", "=", reportId)
          .where("r.generated_by", "=", user.id)
          .executeTakeFirst();
        if (!row) throw new NotFoundError("Rapport introuvable.");
        if (row.upload_status !== "pending") throw new ValidationError(REPORT_NOT_PENDING_MESSAGE);
        return toRecord(row);
      });
    },

    markReady(reportId, sizeBytes, pageCount) {
      return withUser(user, async (trx) => {
        const result = await trx
          .updateTable("reports")
          .set({ upload_status: "ready", size_bytes: sizeBytes, page_count: pageCount })
          .where("id", "=", reportId)
          .where("upload_status", "=", "pending")
          .executeTakeFirst();
        if (Number(result.numUpdatedRows) === 0) {
          throw new ForbiddenError("Ce rapport ne peut plus être confirmé.");
        }
        return toRecord(
          await selectReports(trx).where("r.id", "=", reportId).executeTakeFirstOrThrow(),
        );
      });
    },

    listReady(visitId) {
      return withUser(user, async (trx) => {
        const rows = await selectReports(trx)
          .where("r.visit_id", "=", visitId)
          .where("r.upload_status", "=", "ready")
          .orderBy("r.generated_at", "desc")
          .orderBy("r.number", "desc")
          .execute();
        return rows.map(toRecord);
      });
    },

    findReady(reportId) {
      return withUser(user, async (trx) => {
        const row = await selectReports(trx)
          .where("r.id", "=", reportId)
          .where("r.upload_status", "=", "ready")
          .executeTakeFirst();
        if (!row) throw new NotFoundError("Rapport introuvable.");
        return toRecord(row);
      });
    },

    lastOptions(visitId) {
      return withUser(user, async (trx) => {
        const row = await trx
          .selectFrom("reports")
          .select("options")
          .where("visit_id", "=", visitId)
          .where("upload_status", "=", "ready")
          .orderBy("generated_at", "desc")
          .orderBy("number", "desc")
          .limit(1)
          .executeTakeFirst();
        return row?.options ?? null;
      });
    },

    imagePaths(visitId, photoIds, pages) {
      return withUser(user, async (trx) => {
        const photos =
          photoIds.length > 0
            ? await trx
                .selectFrom("photos")
                .select(["id", "storage_path"])
                .where("visit_id", "=", visitId)
                .where("upload_status", "=", "ready")
                .where("id", "in", photoIds)
                .execute()
            : [];
        const planIds = [...new Set(pages.map((page) => page.planId))];
        const rows =
          planIds.length > 0
            ? await trx
                .selectFrom("site_plan_pages as pp")
                .innerJoin("plan_markers as m", (join) =>
                  join.onRef("m.plan_id", "=", "pp.plan_id").onRef("m.page", "=", "pp.page_number"),
                )
                .select(["pp.plan_id", "pp.page_number", "pp.image_path"])
                .where("m.visit_id", "=", visitId)
                .where("pp.plan_id", "in", planIds)
                .groupBy(["pp.plan_id", "pp.page_number", "pp.image_path"])
                .execute()
            : [];
        const wanted = new Set(pages.map((page) => `${page.planId}:${page.pageNumber}`));
        return {
          photos: Object.fromEntries(photos.map((p) => [p.id, p.storage_path])),
          pages: Object.fromEntries(
            rows
              .filter((row) => wanted.has(`${row.plan_id}:${row.page_number}`))
              .map((row) => [`${row.plan_id}:${row.page_number}`, row.image_path]),
          ),
        };
      });
    },
  };
}

/**
 * Deletes the pending reports older than 24 hours (tab closed during a generation) and returns
 * their storage paths, so that the service removes any uploaded object.
 */
export function purgeStalePendingReportRows(maxAge = "24 hours"): Promise<string[]> {
  return withSystem("report_purge", (trx) => purgeStalePendingReportRowsInTrx(trx, maxAge));
}

/** Same as {@link purgeStalePendingReportRows}, inside a system transaction (scheduled purge). */
export async function purgeStalePendingReportRowsInTrx(
  trx: Trx,
  maxAge = "24 hours",
): Promise<string[]> {
  const { rows } = await sql<{ id: string; storage_path: string }>`
    select id, storage_path from private.purge_stale_pending_reports(${maxAge}::interval)
  `.execute(trx);
  return rows.map((row) => row.storage_path);
}
