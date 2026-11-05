import "server-only";

import { sql } from "kysely";

import { recordAuditInTrx } from "@/server/auth/audit";
import { getAccountAdminService } from "@/server/auth/provider";
import { requireRoleForAction } from "@/server/auth/session";
import { withSystem } from "@/server/db/context";
import { ConflictError, ForbiddenError, ValidationError } from "@/server/errors";
import { log } from "@/server/log";

import { type Account, findAccount } from "./accounts";

/*
 * GDPR (step 11): anonymisation of a deactivated account and export of an account's data.
 * Admin only; every read goes through withSystem because users see four profile columns.
 * See docs/rgpd.md.
 */

/** Normalises a typed name for the confirmation: spaces collapsed, case kept. */
function normalizeTypedName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

/**
 * Anonymises an account **already deactivated**: name and e-mail replaced in the profile and
 * in its internal participations, sign-in identity replaced and blocked, sessions revoked.
 * Irreversible. The admin confirms twice; the second confirmation is the current full name
 * of the account, typed exactly (checked here, not only in the browser).
 */
export async function anonymizeAccount(id: string, typedName: string): Promise<Account> {
  const admin = await requireRoleForAction(["admin"]);
  const target = await findAccount(id);
  if (target.anonymizedAt) throw new ConflictError("Ce compte est déjà anonymisé.");
  if (target.isActive) {
    throw new ForbiddenError(
      "Désactivez d'abord ce compte : seul un compte désactivé s'anonymise.",
    );
  }
  if (normalizeTypedName(typedName) !== normalizeTypedName(target.fullName)) {
    throw new ValidationError("Le nom saisi ne correspond pas au nom du compte.");
  }

  // The profile first (the record that every screen and report reads), in one transaction.
  const placeholderEmail = await withSystem(`accounts.anonymize:${admin.id}`, async (trx) => {
    await sql`select private.anonymize_profile(${id}::uuid, ${admin.id}::uuid)`.execute(trx);
    const row = await trx
      .selectFrom("profiles")
      .select("email")
      .where("id", "=", id)
      .executeTakeFirstOrThrow();
    return row.email;
  });
  try {
    await getAccountAdminService().anonymizeIdentity(id, placeholderEmail);
  } catch (error) {
    // The account is deactivated and its profile anonymised: it cannot sign in anyway. The
    // admin is told to retry; the journal keeps the failure (without any e-mail).
    log.error("accounts.anonymize_identity_failed", { accountId: id, error });
    throw new ConflictError(
      "Le profil est anonymisé, mais l'identité de connexion n'a pas pu l'être. Réessayez.",
    );
  }
  return findAccount(id);
}

/** JSON export of an account (right of access, art. 15 GDPR). */
export interface AccountExport {
  format: "ronde.account-export";
  version: 1;
  exportedAt: string;
  account: {
    id: string;
    fullName: string;
    email: string;
    role: string;
    isActive: boolean;
    createdAt: string;
    anonymizedAt: string | null;
  };
  visits: unknown[];
  participations: unknown[];
  reserves: unknown[];
  photos: unknown[];
  reports: unknown[];
  siteImports: unknown[];
  auditLog: unknown[];
}

/**
 * Everything RONDE holds about one account, as JSON: profile, visits created or written,
 * participations, reserves created, closed or assigned, photos, reports, site imports and the
 * audit entries about or by the account. Other people's e-mail addresses are left out (only
 * the account's own address is included). Audit `account.exported`.
 */
export async function exportAccount(id: string): Promise<AccountExport> {
  const admin = await requireRoleForAction(["admin"]);
  const target = await findAccount(id);

  return withSystem(`accounts.export:${admin.id}`, async (trx) => {
    const visits = await trx
      .selectFrom("visits as v")
      .innerJoin("sites as s", "s.id", "v.site_id")
      .select([
        "v.id",
        "s.warehouse_code as siteCode",
        "v.title",
        "v.visit_date as visitDate",
        "v.type",
        "v.reason",
        "v.status",
        "v.created_at as createdAt",
        "v.deleted_at as deletedAt",
        sql<boolean>`v.created_by = ${id}::uuid`.as("isCreator"),
        sql<boolean>`v.writer_id = ${id}::uuid`.as("isWriter"),
      ])
      .where((eb) =>
        eb.or([
          eb("v.created_by", "=", id),
          eb("v.writer_id", "=", id),
          eb("v.completed_by", "=", id),
        ]),
      )
      .orderBy("v.visit_date")
      .execute();

    const participations = await trx
      .selectFrom("visit_participants as p")
      .innerJoin("visits as v", "v.id", "p.visit_id")
      .select([
        "p.visit_id as visitId",
        "v.title as visitTitle",
        "p.full_name as fullName",
        "p.company",
        "p.job_title as jobTitle",
        "p.is_present as isPresent",
      ])
      .where("p.profile_id", "=", id)
      .execute();

    const reserves = await trx
      .selectFrom("reserves as r")
      .select([
        "r.id",
        "r.visit_id as visitId",
        "r.number",
        "r.action",
        "r.status",
        "r.priority",
        "r.due_date as dueDate",
        "r.created_at as createdAt",
        "r.closed_at as closedAt",
        sql<boolean>`r.created_by = ${id}::uuid`.as("isCreator"),
        sql<boolean>`r.closed_by = ${id}::uuid`.as("hasClosed"),
        sql<boolean>`r.responsible_profile_id = ${id}::uuid`.as("isResponsible"),
      ])
      .where((eb) =>
        eb.or([
          eb("r.created_by", "=", id),
          eb("r.closed_by", "=", id),
          eb("r.responsible_profile_id", "=", id),
        ]),
      )
      .orderBy("r.created_at")
      .execute();

    const photos = await trx
      .selectFrom("photos")
      .select([
        "id",
        "visit_id as visitId",
        "original_filename as originalFilename",
        "upload_status as uploadStatus",
        "created_at as createdAt",
      ])
      .where("created_by", "=", id)
      .orderBy("created_at")
      .execute();

    const reports = await trx
      .selectFrom("reports")
      .select([
        "id",
        "visit_id as visitId",
        "file_name as fileName",
        "upload_status as uploadStatus",
        "generated_at as generatedAt",
      ])
      .where("generated_by", "=", id)
      .orderBy("generated_at")
      .execute();

    const siteImports = await trx
      .selectFrom("site_import_runs")
      .select(["id", "mode", "file_name as fileName", "created_at as createdAt"])
      .where("performed_by", "=", id)
      .orderBy("created_at")
      .execute();

    const auditLog = await trx
      .selectFrom("audit_log")
      .select([
        "occurred_at as occurredAt",
        "action",
        "entity_type as entityType",
        "entity_id as entityId",
        "details",
        sql<boolean>`actor_id = ${id}::uuid`.as("byAccount"),
      ])
      .where((eb) => eb.or([eb("actor_id", "=", id), eb("entity_id", "=", id)]))
      .orderBy("occurred_at")
      .execute();

    await recordAuditInTrx(trx, "account.exported", "profile", id, {}, admin.id);

    return {
      format: "ronde.account-export",
      version: 1,
      exportedAt: new Date().toISOString(),
      account: {
        id: target.id,
        fullName: target.fullName,
        email: target.email,
        role: target.role,
        isActive: target.isActive,
        createdAt: target.createdAt.toISOString(),
        anonymizedAt: target.anonymizedAt ? target.anonymizedAt.toISOString() : null,
      },
      visits,
      participations,
      reserves,
      photos,
      reports,
      siteImports,
      auditLog,
    };
  });
}
