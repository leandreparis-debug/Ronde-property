import {
  type ExistingSite,
  type FieldDiff,
  type ImportCounts,
  type ImportedSiteRow,
  type ImportPlan,
  MASS_DEACTIVATION_RATIO,
  type PlanOptions,
  type RowError,
  type SiteField,
} from "./types";

type OptionalField = Exclude<SiteField, "warehouse_code" | "is_active">;

const FIELD_MAP: Array<{
  field: OptionalField;
  row: keyof ImportedSiteRow;
  site: keyof ExistingSite;
}> = [
  { field: "name", row: "name", site: "name" },
  { field: "address", row: "address", site: "address" },
  { field: "postal_code", row: "postalCode", site: "postalCode" },
  { field: "city", row: "city", site: "city" },
  { field: "surface_m2", row: "surfaceM2", site: "surfaceM2" },
  { field: "category", row: "category", site: "category" },
  { field: "latitude", row: "latitude", site: "latitude" },
  { field: "longitude", row: "longitude", site: "longitude" },
];

function sameValue(a: unknown, b: unknown): boolean {
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) < 1e-9;
  return a === b;
}

/**
 * Field-by-field differences between a stored site and a file row. Empty cells are skipped
 * unless `emptyClearsValue` is on; fields absent from the file are always skipped.
 */
export function diffSite(
  site: ExistingSite,
  row: ImportedSiteRow,
  presentFields: ReadonlySet<SiteField>,
  options: PlanOptions,
): { diff: FieldDiff; keptEmpty: number } {
  const diff: FieldDiff = {};
  let keptEmpty = 0;
  for (const { field, row: rowKey, site: siteKey } of FIELD_MAP) {
    if (!presentFields.has(field)) continue;
    const next = row[rowKey] as FieldDiff[OptionalField] extends infer T
      ? T extends { new: infer N }
        ? N
        : never
      : never;
    const current = site[siteKey] as typeof next;
    if (next === null && !options.emptyClearsValue) {
      if (current !== null) keptEmpty += 1;
      continue;
    }
    if (!sameValue(current, next)) diff[field] = { old: current, new: next };
  }
  return { diff, keptEmpty };
}

/**
 * Computes what an import would do, without touching the database. Pure.
 *
 * - `create`: unknown code; `update`: known code with at least one changed field;
 * - `reactivate`: inactive site present in the file (and not marked inactive);
 * - `deactivate`: the file marks the site inactive, or (full referential only) an active site
 *   is absent from the file;
 * - `reject`: invalid line, or a code appearing several times in the file (every occurrence).
 */
export function planImport(
  rows: ImportedSiteRow[],
  parseErrors: RowError[],
  existingSites: ExistingSite[],
  options: PlanOptions,
  presentFields: readonly SiteField[],
): ImportPlan {
  const present = new Set(presentFields);
  const byCode = new Map(existingSites.map((site) => [site.warehouseCode, site]));
  const rejects: RowError[] = [...parseErrors];

  // Duplicated codes in the file: every occurrence is rejected.
  const occurrences = new Map<string, number[]>();
  for (const row of rows) {
    occurrences.set(row.warehouseCode, [...(occurrences.get(row.warehouseCode) ?? []), row.line]);
  }
  const duplicated = new Set<string>();
  for (const [code, lines] of occurrences) {
    if (lines.length > 1) {
      duplicated.add(code);
      for (const line of lines) {
        rejects.push({
          line,
          code,
          message: `Code en double dans le fichier (lignes ${lines.join(", ")}).`,
        });
      }
    }
  }

  const plan: ImportPlan = {
    counts: { create: 0, update: 0, unchanged: 0, reactivate: 0, deactivate: 0, reject: 0 },
    creates: [],
    updates: [],
    unchanged: [],
    reactivates: [],
    deactivates: [],
    rejects,
    guard: { activeSites: 0, deactivationsByAbsence: 0, ratio: 0, requiresConfirmation: false },
    keptEmptyValues: 0,
  };

  const seen = new Set<string>();
  for (const row of rows) {
    if (duplicated.has(row.warehouseCode)) continue;
    seen.add(row.warehouseCode);
    const site = byCode.get(row.warehouseCode);
    if (!site) {
      plan.creates.push({ line: row.line, row });
      continue;
    }
    const { diff, keptEmpty } = diffSite(site, row, present, options);
    plan.keptEmptyValues += keptEmpty;
    const change = {
      line: row.line,
      siteId: site.id,
      warehouseCode: site.warehouseCode,
      name: row.name,
      diff,
    };

    if (row.isActive === false) {
      if (site.isActive) {
        plan.deactivates.push({
          siteId: site.id,
          warehouseCode: site.warehouseCode,
          name: site.name,
          reason: "explicit",
          line: row.line,
        });
        if (Object.keys(diff).length > 0) plan.updates.push(change);
      } else if (Object.keys(diff).length > 0) {
        plan.updates.push(change);
      } else {
        plan.unchanged.push({ line: row.line, warehouseCode: site.warehouseCode, name: site.name });
      }
      continue;
    }

    if (!site.isActive) {
      plan.reactivates.push(change);
    } else if (Object.keys(diff).length > 0) {
      plan.updates.push(change);
    } else {
      plan.unchanged.push({ line: row.line, warehouseCode: site.warehouseCode, name: site.name });
    }
  }

  const activeSites = existingSites.filter((site) => site.isActive);
  if (options.fullReferential) {
    for (const site of activeSites) {
      if (!seen.has(site.warehouseCode) && !duplicated.has(site.warehouseCode)) {
        plan.deactivates.push({
          siteId: site.id,
          warehouseCode: site.warehouseCode,
          name: site.name,
          reason: "absent",
          line: null,
        });
      }
    }
  }
  const byAbsence = plan.deactivates.filter((d) => d.reason === "absent").length;
  const ratio = activeSites.length === 0 ? 0 : byAbsence / activeSites.length;
  plan.guard = {
    activeSites: activeSites.length,
    deactivationsByAbsence: byAbsence,
    ratio,
    requiresConfirmation: options.fullReferential && ratio > MASS_DEACTIVATION_RATIO,
  };

  plan.rejects.sort((a, b) => a.line - b.line);
  plan.counts = countPlan(plan);
  return plan;
}

function countPlan(plan: ImportPlan): ImportCounts {
  return {
    create: plan.creates.length,
    update: plan.updates.length,
    unchanged: plan.unchanged.length,
    reactivate: plan.reactivates.length,
    deactivate: plan.deactivates.length,
    reject: plan.rejects.length,
  };
}

/** True when two count sets are identical (used to compare a simulation with the apply). */
export function sameCounts(a: ImportCounts, b: ImportCounts): boolean {
  return (Object.keys(a) as Array<keyof ImportCounts>).every((key) => a[key] === b[key]);
}
