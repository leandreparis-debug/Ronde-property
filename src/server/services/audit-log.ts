import "server-only";

import { requireRoleForAction } from "@/server/auth/session";
import { withUser } from "@/server/db/context";

export const AUDIT_PAGE_SIZE = 50;

/** French labels of the audit actions written by triggers, RPCs and services. */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  "visit.created": "Visite créée",
  "visit.updated": "Visite modifiée",
  "visit.completed": "Visite terminée",
  "visit.reopened": "Visite rouverte",
  "visit.deleted": "Visite supprimée",
  "reserve.created": "Réserve créée",
  "reserve.status_changed": "Statut de réserve modifié",
  "reserve.deleted": "Réserve supprimée",
  "report.generated": "Rapport généré",
  "site_plan.imported": "Plan importé",
  "site_plan.archived": "Plan archivé",
  "site_plan.unarchived": "Plan désarchivé",
  "site_import.simulated": "Import VIGIE simulé",
  "site_import.applied": "Import VIGIE appliqué",
  "profile.role_changed": "Rôle modifié",
  "profile.activated": "Compte réactivé",
  "profile.deactivated": "Compte désactivé",
  "account.created": "Compte créé",
  "account.password_reset": "Mot de passe réinitialisé",
  "auth.signed_in": "Connexion",
  "auth.sign_in_failed": "Connexion refusée",
  "auth.signed_out": "Déconnexion",
};

/** Label of an action, or the raw action for unknown ones. */
export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action;
}

export interface AuditEntry {
  id: number;
  occurredAt: Date;
  actorId: string | null;
  actorName: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  details: Record<string, unknown>;
}

export interface AuditFilters {
  action?: string;
  actorId?: string;
  /** Inclusive, YYYY-MM-DD, Europe/Paris. */
  from?: string;
  /** Inclusive, YYYY-MM-DD, Europe/Paris. */
  to?: string;
}

export interface AuditPage {
  entries: AuditEntry[];
  total: number;
  page: number;
  pageCount: number;
  actors: Array<{ id: string; fullName: string }>;
  actions: string[];
}

/**
 * Pages of the audit log, newest first, read **as the admin** so the RLS policy applies.
 * Filters: action, actor, period (Paris dates).
 */
export async function listAuditLog(filters: AuditFilters = {}, page = 1): Promise<AuditPage> {
  const admin = await requireRoleForAction(["admin"]);
  const safePage = Number.isInteger(page) && page >= 1 ? page : 1;

  return withUser(admin, async (trx) => {
    let query = trx
      .selectFrom("audit_log")
      .leftJoin("profiles", "profiles.id", "audit_log.actor_id")
      .select([
        "audit_log.id",
        "audit_log.occurred_at",
        "audit_log.actor_id",
        "profiles.full_name as actor_name",
        "audit_log.action",
        "audit_log.entity_type",
        "audit_log.entity_id",
        "audit_log.details",
      ]);
    let countQuery = trx
      .selectFrom("audit_log")
      .select((eb) => eb.fn.countAll<string>().as("count"));

    if (filters.action) {
      query = query.where("audit_log.action", "=", filters.action);
      countQuery = countQuery.where("action", "=", filters.action);
    }
    if (filters.actorId) {
      query = query.where("audit_log.actor_id", "=", filters.actorId);
      countQuery = countQuery.where("actor_id", "=", filters.actorId);
    }
    if (filters.from) {
      const from = new Date(`${filters.from}T00:00:00+01:00`);
      query = query.where("audit_log.occurred_at", ">=", from);
      countQuery = countQuery.where("occurred_at", ">=", from);
    }
    if (filters.to) {
      const to = new Date(`${filters.to}T23:59:59.999+02:00`);
      query = query.where("audit_log.occurred_at", "<=", to);
      countQuery = countQuery.where("occurred_at", "<=", to);
    }

    const total = Number((await countQuery.executeTakeFirstOrThrow()).count);
    const pageCount = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));
    const current = Math.min(safePage, pageCount);

    const rows = await query
      .orderBy("audit_log.id", "desc")
      .limit(AUDIT_PAGE_SIZE)
      .offset((current - 1) * AUDIT_PAGE_SIZE)
      .execute();

    const actors = await trx
      .selectFrom("profiles")
      .select(["id", "full_name"])
      .orderBy("full_name")
      .execute();
    const actions = await trx
      .selectFrom("audit_log")
      .select("action")
      .distinct()
      .orderBy("action")
      .execute();

    return {
      entries: rows.map((row) => ({
        id: Number(row.id),
        occurredAt: row.occurred_at,
        actorId: row.actor_id,
        actorName: row.actor_name,
        action: row.action,
        entityType: row.entity_type,
        entityId: row.entity_id,
        details: (row.details ?? {}) as Record<string, unknown>,
      })),
      total,
      page: current,
      pageCount,
      actors: actors.map((a) => ({ id: a.id, fullName: a.full_name })),
      actions: actions.map((a) => a.action),
    };
  });
}
