import "server-only";

import { sql } from "kysely";

import { todayInParis } from "@/lib/format";
import { type Trx, type UserRef, withUser } from "@/server/db/context";
import type { VisitInput, VisitSummary, VisitUpdate } from "@/server/domain";
import type { VisitReason, VisitStatus, VisitType } from "@/server/domain/enums";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";

export const VISIT_PAGE_SIZE = 20;

export interface VisitListFilters {
  /** `mine`: created, written or attended (linked profile) by the user. */
  scope: "mine" | "all";
  /** Title or site, accent- and case-insensitive. */
  q?: string;
  status?: VisitStatus;
  reason?: VisitReason;
  /** Inclusive bounds on visit_date (YYYY-MM-DD). */
  from?: string;
  to?: string;
  siteId?: string;
  page?: number;
}

export interface VisitListPage {
  items: VisitSummary[];
  total: number;
  page: number;
  pageCount: number;
}

export interface VisitPermissions {
  canEdit: boolean;
  canManage: boolean;
}

/** A visit with its site, people and the caller's permissions. */
export interface VisitDetail {
  id: string;
  siteId: string;
  site: { code: string; name: string; city: string | null };
  type: VisitType;
  reason: VisitReason;
  title: string;
  visitDate: string;
  subject: string | null;
  status: VisitStatus;
  writerId: string | null;
  writerName: string | null;
  createdBy: string;
  createdByName: string | null;
  completedAt: Date | null;
  completedByName: string | null;
  deletedAt: Date | null;
  deletedByName: string | null;
  duplicatedFromId: string | null;
  version: number;
  updatedAt: Date;
  updatedByName: string | null;
  permissions: VisitPermissions;
}

/** Fresh version information after a write. */
export interface VisitVersion {
  version: number;
  updatedAt: Date;
}

/**
 * Visits: list, detail with permissions, creation, optimistic update, duplication and the
 * lifecycle RPCs. Everything runs through `withUser`, so Row Level Security applies.
 */
export interface VisitRepository {
  list(filters: VisitListFilters): Promise<VisitListPage>;
  getById(id: string): Promise<VisitDetail | null>;
  create(input: VisitInput): Promise<{ id: string }>;
  /** Optimistic update: `ConflictError` when `version` is stale. */
  update(id: string, version: number, patch: VisitUpdate): Promise<VisitVersion>;
  /** Copies type, reason, subject, writer, participants; title suffixed « (suite) », today's date. */
  duplicate(id: string): Promise<{ id: string }>;
  complete(id: string): Promise<void>;
  reopen(id: string): Promise<void>;
  softDelete(id: string): Promise<void>;
}

/** Name of the last writer of a visit, for the conflict message (as the user, RLS applies). */
export async function lastWriterName(trx: Trx, visitId: string): Promise<string | null> {
  const row = await trx
    .selectFrom("visits")
    .leftJoin("profiles", "profiles.id", "visits.updated_by")
    .select("profiles.full_name")
    .where("visits.id", "=", visitId)
    .executeTakeFirst();
  return row?.full_name ?? null;
}

/** Builds the conflict error shown to the user. */
export async function versionConflict(trx: Trx, visitId: string): Promise<ConflictError> {
  const name = (await lastWriterName(trx, visitId)) ?? "un autre utilisateur";
  return new ConflictError(
    `Cette visite a été modifiée entre-temps par ${name}. Rechargez pour voir la dernière version.`,
  );
}

/** Throws `NotFoundError` or `ConflictError` unless the visit is at the expected version. */
export async function assertVisitVersion(
  trx: Trx,
  visitId: string,
  version: number,
): Promise<void> {
  const row = await trx
    .selectFrom("visits")
    .select("version")
    .where("id", "=", visitId)
    .executeTakeFirst();
  if (!row) throw new NotFoundError("Visite introuvable.");
  if (row.version !== version) throw await versionConflict(trx, visitId);
}

function toSummary(row: {
  id: string | null;
  site_id: string | null;
  site_code: string | null;
  site_name: string | null;
  site_city: string | null;
  type: VisitType | null;
  reason: VisitReason | null;
  title: string | null;
  visit_date: string | null;
  status: VisitStatus | null;
  open_reserves_count: number | null;
  overdue_reserves_count: number | null;
  done_reserves_count: number | null;
  photos_count: number | null;
  last_report_at: Date | null;
}): VisitSummary | null {
  if (
    !row.id ||
    !row.site_id ||
    !row.type ||
    !row.reason ||
    !row.title ||
    !row.visit_date ||
    !row.status
  )
    return null;
  return {
    id: row.id,
    siteId: row.site_id,
    siteCode: row.site_code ?? "",
    siteName: row.site_name ?? "",
    siteCity: row.site_city,
    type: row.type,
    reason: row.reason,
    title: row.title,
    visitDate: row.visit_date,
    status: row.status,
    openReservesCount: row.open_reserves_count ?? 0,
    overdueReservesCount: row.overdue_reserves_count ?? 0,
    doneReservesCount: row.done_reserves_count ?? 0,
    photosCount: row.photos_count ?? 0,
    lastReportAt: row.last_report_at ? row.last_report_at.toISOString() : null,
  };
}

const SUMMARY_COLUMNS = [
  "id",
  "site_id",
  "site_code",
  "site_name",
  "site_city",
  "type",
  "reason",
  "title",
  "visit_date",
  "status",
  "open_reserves_count",
  "overdue_reserves_count",
  "done_reserves_count",
  "photos_count",
  "last_report_at",
] as const;

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** Kysely implementation of `VisitRepository` for the given (verified) user. */
export function createVisitRepository(user: UserRef): VisitRepository {
  return {
    async list(filters) {
      const pageSize = VISIT_PAGE_SIZE;
      const requestedPage = filters.page && filters.page >= 1 ? Math.floor(filters.page) : 1;
      const q = (filters.q ?? "").trim().slice(0, 200);
      const pattern = `%${escapeLike(q.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase())}%`;

      return withUser(user, async (trx) => {
        let base = trx.selectFrom("visit_summaries as vs");
        if (filters.scope === "mine") {
          base = base.where((eb) =>
            eb.or([
              eb("vs.created_by", "=", user.id),
              eb("vs.writer_id", "=", user.id),
              eb.exists(
                eb
                  .selectFrom("visit_participants as vp")
                  .select("vp.id")
                  .whereRef("vp.visit_id", "=", "vs.id")
                  .where("vp.profile_id", "=", user.id),
              ),
            ]),
          );
        }
        if (q) {
          base = base.where(
            sql<boolean>`private.search_text(coalesce(vs.title, '') || ' ' || coalesce(vs.site_name, '') || ' ' || coalesce(vs.site_code, '')) ilike ${pattern} escape '\\'`,
          );
        }
        if (filters.status) base = base.where("vs.status", "=", filters.status);
        if (filters.reason) base = base.where("vs.reason", "=", filters.reason);
        if (filters.from) base = base.where("vs.visit_date", ">=", filters.from);
        if (filters.to) base = base.where("vs.visit_date", "<=", filters.to);
        if (filters.siteId) base = base.where("vs.site_id", "=", filters.siteId);

        const total = Number(
          (
            await base
              .select((eb) => eb.fn.countAll<string>().as("count"))
              .executeTakeFirstOrThrow()
          ).count,
        );
        const pageCount = Math.max(1, Math.ceil(total / pageSize));
        const page = Math.min(requestedPage, pageCount);
        const rows = await base
          .select(SUMMARY_COLUMNS.map((column) => `vs.${column}` as const))
          .orderBy("vs.visit_date", "desc")
          .orderBy("vs.created_at", "desc")
          .limit(pageSize)
          .offset((page - 1) * pageSize)
          .execute();
        return { items: rows.flatMap((row) => toSummary(row) ?? []), total, page, pageCount };
      });
    },

    async getById(id) {
      return withUser(user, async (trx) => {
        const row = await trx
          .selectFrom("visits as v")
          .innerJoin("sites as s", "s.id", "v.site_id")
          .leftJoin("profiles as writer", "writer.id", "v.writer_id")
          .leftJoin("profiles as creator", "creator.id", "v.created_by")
          .leftJoin("profiles as completer", "completer.id", "v.completed_by")
          .leftJoin("profiles as deleter", "deleter.id", "v.deleted_by")
          .leftJoin("profiles as updater", "updater.id", "v.updated_by")
          .select([
            "v.id",
            "v.site_id",
            "s.warehouse_code",
            "s.name as site_name",
            "s.city as site_city",
            "v.type",
            "v.reason",
            "v.title",
            "v.visit_date",
            "v.subject",
            "v.status",
            "v.writer_id",
            "writer.full_name as writer_name",
            "v.created_by",
            "creator.full_name as creator_name",
            "v.completed_at",
            "completer.full_name as completer_name",
            "v.deleted_at",
            "deleter.full_name as deleter_name",
            "v.duplicated_from_id",
            "v.version",
            "v.updated_at",
            "updater.full_name as updater_name",
            sql<boolean>`private.can_edit_visit(v.id)`.as("can_edit"),
            sql<boolean>`private.can_manage_visit(v.id)`.as("can_manage"),
          ])
          .where("v.id", "=", id)
          .executeTakeFirst();
        if (!row) return null;
        return {
          id: row.id,
          siteId: row.site_id,
          site: { code: row.warehouse_code, name: row.site_name, city: row.site_city },
          type: row.type,
          reason: row.reason,
          title: row.title,
          visitDate: row.visit_date,
          subject: row.subject,
          status: row.status,
          writerId: row.writer_id,
          writerName: row.writer_name,
          createdBy: row.created_by,
          createdByName: row.creator_name,
          completedAt: row.completed_at,
          completedByName: row.completer_name,
          deletedAt: row.deleted_at,
          deletedByName: row.deleter_name,
          duplicatedFromId: row.duplicated_from_id,
          version: row.version,
          updatedAt: row.updated_at,
          updatedByName: row.updater_name,
          permissions: { canEdit: row.can_edit, canManage: row.can_manage },
        };
      });
    },

    async create(input) {
      return withUser(user, async (trx) => {
        const site = await trx
          .selectFrom("sites")
          .select(["id", "is_active"])
          .where("id", "=", input.siteId)
          .executeTakeFirst();
        if (!site || !site.is_active) {
          throw new ValidationError(
            "Ce site est inactif ou inconnu : choisissez un site actif du référentiel.",
          );
        }
        const row = await trx
          .insertInto("visits")
          .values({
            site_id: input.siteId,
            type: input.type,
            reason: input.reason,
            title: input.title,
            visit_date: input.visitDate,
            subject: input.subject,
            writer_id: input.writerId,
            created_by: user.id,
          })
          .returning("id")
          .executeTakeFirstOrThrow();
        return { id: row.id };
      });
    },

    async update(id, version, patch) {
      return withUser(user, async (trx) => {
        const result = await trx
          .updateTable("visits")
          .set({
            type: patch.type,
            reason: patch.reason,
            title: patch.title,
            visit_date: patch.visitDate,
            subject: patch.subject,
            writer_id: patch.writerId,
          })
          .where("id", "=", id)
          .where("version", "=", version)
          .returning(["version", "updated_at"])
          .executeTakeFirst();
        if (result) return { version: result.version, updatedAt: result.updated_at };
        const current = await trx
          .selectFrom("visits")
          .select("version")
          .where("id", "=", id)
          .executeTakeFirst();
        if (!current) throw new NotFoundError("Visite introuvable.");
        if (current.version !== version) throw await versionConflict(trx, id);
        // Same version yet nothing updated: the user may not edit this visit (RLS).
        throw new ForbiddenError("Cette visite n'est pas modifiable.");
      });
    },

    async duplicate(id) {
      return withUser(user, async (trx) => {
        const source = await trx
          .selectFrom("visits")
          .select(["site_id", "type", "reason", "title", "subject", "writer_id"])
          .where("id", "=", id)
          .executeTakeFirst();
        if (!source) throw new NotFoundError("Visite introuvable.");
        const created = await trx
          .insertInto("visits")
          .values({
            site_id: source.site_id,
            type: source.type,
            reason: source.reason,
            title: `${source.title} (suite)`.slice(0, 200),
            visit_date: todayInParis(),
            subject: source.subject,
            writer_id: source.writer_id,
            created_by: user.id,
            duplicated_from_id: id,
          })
          .returning("id")
          .executeTakeFirstOrThrow();
        const participants = await trx
          .selectFrom("visit_participants")
          .select(["profile_id", "full_name", "company", "job_title", "email", "sort_order"])
          .where("visit_id", "=", id)
          .orderBy("sort_order")
          .orderBy("created_at")
          .execute();
        for (const [index, participant] of participants.entries()) {
          await trx
            .insertInto("visit_participants")
            .values({
              visit_id: created.id,
              profile_id: participant.profile_id,
              full_name: participant.full_name,
              company: participant.company,
              job_title: participant.job_title,
              email: participant.email,
              is_present: true,
              sort_order: index,
            })
            .execute();
        }
        return { id: created.id };
      });
    },

    async complete(id) {
      await withUser(user, (trx) => sql`select public.complete_visit(${id}::uuid)`.execute(trx));
    },

    async reopen(id) {
      await withUser(user, (trx) => sql`select public.reopen_visit(${id}::uuid)`.execute(trx));
    },

    async softDelete(id) {
      await withUser(user, (trx) => sql`select public.soft_delete_visit(${id}::uuid)`.execute(trx));
    },
  };
}
