import "server-only";

import { type Trx, withSystem } from "@/server/db/context";
import { ValidationError } from "@/server/errors";

import { planImport, sameCounts } from "./plan";
import type { ExistingSite, ImportCounts, ImportPlan, ParseResult, PlanOptions } from "./types";

/** Report returned to the admin after a simulation or an application. */
export interface ImportReport {
  runId: string;
  mode: "simulate" | "apply";
  fileName: string;
  sha256: string;
  encoding: ParseResult["encoding"];
  delimiter: string;
  totalLines: number;
  recognizedColumns: ParseResult["recognizedColumns"];
  ignoredColumns: string[];
  options: PlanOptions;
  plan: ImportPlan;
}

/** What the apply must match: the fingerprint and the counts of the validated simulation. */
export interface ExpectedOutcome {
  sha256: string;
  counts: ImportCounts;
}

const SITE_COLUMNS = [
  "id",
  "warehouse_code",
  "name",
  "address",
  "postal_code",
  "city",
  "surface_m2",
  "category",
  "latitude",
  "longitude",
  "is_active",
] as const;

async function loadExistingSites(trx: Trx): Promise<ExistingSite[]> {
  const rows = await trx.selectFrom("sites").select(SITE_COLUMNS).execute();
  return rows.map((row) => ({
    id: row.id,
    warehouseCode: row.warehouse_code,
    name: row.name,
    address: row.address,
    postalCode: row.postal_code,
    city: row.city,
    surfaceM2: row.surface_m2,
    category: row.category,
    latitude: row.latitude,
    longitude: row.longitude,
    isActive: row.is_active,
  }));
}

function buildPlan(parse: ParseResult, existing: ExistingSite[], options: PlanOptions): ImportPlan {
  return planImport(parse.rows, parse.errors, existing, options, parse.presentFields);
}

async function recordRun(
  trx: Trx,
  mode: "simulate" | "apply",
  parse: ParseResult,
  plan: ImportPlan,
  options: PlanOptions,
  actorId: string,
): Promise<string> {
  const row = await trx
    .insertInto("site_import_runs")
    .values({
      file_name: parse.fileName,
      mode,
      rows_total: parse.totalLines,
      rows_created: plan.counts.create,
      rows_updated: plan.counts.update + plan.counts.reactivate,
      rows_deactivated: plan.counts.deactivate,
      rows_rejected: plan.counts.reject,
      errors: JSON.stringify(plan.rejects),
      file_sha256: parse.sha256,
      options: JSON.stringify({ ...options, encoding: parse.encoding, delimiter: parse.delimiter }),
      performed_by: actorId,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

function toReport(
  runId: string,
  mode: "simulate" | "apply",
  parse: ParseResult,
  plan: ImportPlan,
  options: PlanOptions,
): ImportReport {
  return {
    runId,
    mode,
    fileName: parse.fileName,
    sha256: parse.sha256,
    encoding: parse.encoding,
    delimiter: parse.delimiter,
    totalLines: parse.totalLines,
    recognizedColumns: parse.recognizedColumns,
    ignoredColumns: parse.ignoredColumns,
    options,
    plan,
  };
}

/**
 * Simulates an import: computes the plan against the current sites, records a
 * `site_import_runs` line in `simulate` mode (traceability) and writes nothing in `sites`.
 * The caller must have checked the admin role.
 */
export async function simulateImport(
  parse: ParseResult,
  options: PlanOptions,
  actorId: string,
): Promise<ImportReport> {
  return withSystem("site_import.simulate", async (trx) => {
    const existing = await loadExistingSites(trx);
    const plan = buildPlan(parse, existing, options);
    const runId = await recordRun(trx, "simulate", parse, plan, options, actorId);
    return toReport(runId, "simulate", parse, plan, options);
  });
}

export interface ApplyHooks {
  /** Test hook, called inside the transaction after the writes: throwing rolls everything back. */
  beforeCommit?: (trx: Trx) => Promise<void>;
}

/**
 * Applies an import in a single transaction. The plan is recomputed on the current database
 * and must match the validated simulation (fingerprint and counts); otherwise nothing is
 * written and the admin is asked to simulate again. A mass deactivation (over 20 % of the
 * active sites) requires `confirmMassDeactivation`. Never deletes a site. The
 * `site_import_runs` line triggers the `site_import.applied` audit entry.
 */
export async function applyImport(
  parse: ParseResult,
  options: PlanOptions,
  actorId: string,
  expected: ExpectedOutcome,
  confirmMassDeactivation = false,
  hooks: ApplyHooks = {},
): Promise<ImportReport> {
  if (expected.sha256 !== parse.sha256) {
    throw new ValidationError("Le fichier a changé depuis la simulation : relancez la simulation.");
  }
  return withSystem("site_import.apply", async (trx) => {
    const existing = await loadExistingSites(trx);
    const plan = buildPlan(parse, existing, options);
    if (!sameCounts(plan.counts, expected.counts)) {
      throw new ValidationError(
        "Le référentiel a changé depuis la simulation (les compteurs diffèrent) : relancez la simulation.",
      );
    }
    if (plan.guard.requiresConfirmation && !confirmMassDeactivation) {
      throw new ValidationError(
        `Ce fichier désactiverait ${plan.guard.deactivationsByAbsence} des ${plan.guard.activeSites} sites actifs : confirmez explicitement cette désactivation massive.`,
      );
    }

    const now = new Date();
    for (const { row } of plan.creates) {
      await trx
        .insertInto("sites")
        .values({
          warehouse_code: row.warehouseCode,
          name: row.name,
          address: row.address,
          postal_code: row.postalCode,
          city: row.city,
          surface_m2: row.surfaceM2,
          category: row.category,
          latitude: row.latitude,
          longitude: row.longitude,
          is_active: row.isActive ?? true,
          imported_at: now,
        })
        .execute();
    }
    for (const change of [...plan.updates, ...plan.reactivates]) {
      const values: Record<string, unknown> = { imported_at: now };
      for (const [field, delta] of Object.entries(change.diff)) values[field] = delta.new;
      if (plan.reactivates.includes(change)) values.is_active = true;
      await trx.updateTable("sites").set(values).where("id", "=", change.siteId).execute();
    }
    for (const deactivation of plan.deactivates) {
      await trx
        .updateTable("sites")
        .set({ is_active: false, imported_at: now })
        .where("id", "=", deactivation.siteId)
        .execute();
    }
    const runId = await recordRun(trx, "apply", parse, plan, options, actorId);
    if (hooks.beforeCommit) await hooks.beforeCommit(trx);
    return toReport(runId, "apply", parse, plan, options);
  });
}
