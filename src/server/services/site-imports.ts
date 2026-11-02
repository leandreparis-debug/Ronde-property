import "server-only";

import { requireRoleForAction } from "@/server/auth/session";
import { withUser } from "@/server/db/context";
import type { ImportMode } from "@/server/domain/enums";
import {
  applyImport,
  type ExpectedOutcome,
  type ImportReport,
  parseSitesCsv,
  type PlanOptions,
  simulateImport,
} from "@/server/sites/import";
import type { RowError } from "@/server/sites/import/types";

/** A past import, as listed on /admin/sites/imports. */
export interface ImportRun {
  id: string;
  createdAt: Date;
  performedBy: string | null;
  fileName: string;
  mode: ImportMode;
  fileSha256: string | null;
  rowsTotal: number;
  rowsCreated: number;
  rowsUpdated: number;
  rowsDeactivated: number;
  rowsRejected: number;
  errors: RowError[];
  options: Record<string, unknown>;
}

/** Admin: parses the file and simulates the import (nothing written in sites). */
export async function simulateSitesImport(
  buffer: Uint8Array,
  fileName: string,
  options: PlanOptions,
): Promise<ImportReport> {
  const admin = await requireRoleForAction(["admin"]);
  const parse = parseSitesCsv(buffer, fileName);
  return simulateImport(parse, options, admin.id);
}

/** Admin: parses the file again and applies the import if it still matches the simulation. */
export async function applySitesImport(
  buffer: Uint8Array,
  fileName: string,
  options: PlanOptions,
  expected: ExpectedOutcome,
  confirmMassDeactivation: boolean,
): Promise<ImportReport> {
  const admin = await requireRoleForAction(["admin"]);
  const parse = parseSitesCsv(buffer, fileName);
  return applyImport(parse, options, admin.id, expected, confirmMassDeactivation);
}

/** Admin: past imports, newest first, read as the admin (RLS). */
export async function listImportRuns(limit = 100): Promise<ImportRun[]> {
  const admin = await requireRoleForAction(["admin"]);
  const rows = await withUser(admin, (trx) =>
    trx
      .selectFrom("site_import_runs")
      .leftJoin("profiles", "profiles.id", "site_import_runs.performed_by")
      .select([
        "site_import_runs.id",
        "site_import_runs.created_at",
        "profiles.full_name",
        "site_import_runs.file_name",
        "site_import_runs.mode",
        "site_import_runs.file_sha256",
        "site_import_runs.rows_total",
        "site_import_runs.rows_created",
        "site_import_runs.rows_updated",
        "site_import_runs.rows_deactivated",
        "site_import_runs.rows_rejected",
        "site_import_runs.errors",
        "site_import_runs.options",
      ])
      .orderBy("site_import_runs.created_at", "desc")
      .limit(limit)
      .execute(),
  );
  return rows.map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    performedBy: row.full_name,
    fileName: row.file_name,
    mode: row.mode,
    fileSha256: row.file_sha256,
    rowsTotal: row.rows_total,
    rowsCreated: row.rows_created,
    rowsUpdated: row.rows_updated,
    rowsDeactivated: row.rows_deactivated,
    rowsRejected: row.rows_rejected,
    errors: Array.isArray(row.errors) ? (row.errors as unknown as RowError[]) : [],
    options: (row.options ?? {}) as Record<string, unknown>,
  }));
}
