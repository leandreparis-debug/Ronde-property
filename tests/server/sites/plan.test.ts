import { describe, expect, it } from "vitest";

import { planImport, sameCounts } from "@/server/sites/import/plan";
import type { ExistingSite, ImportedSiteRow, SiteField } from "@/server/sites/import/types";

const ALL_FIELDS: SiteField[] = [
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
];

function site(overrides: Partial<ExistingSite> & { warehouseCode: string }): ExistingSite {
  return {
    id: `id-${overrides.warehouseCode}`,
    name: `Site ${overrides.warehouseCode}`,
    address: null,
    postalCode: null,
    city: "Lyon",
    surfaceM2: 1000,
    category: "Logistique sèche",
    latitude: null,
    longitude: null,
    isActive: true,
    ...overrides,
  };
}

function row(
  overrides: Partial<ImportedSiteRow> & { warehouseCode: string; line: number },
): ImportedSiteRow {
  return {
    name: `Site ${overrides.warehouseCode}`,
    address: null,
    postalCode: null,
    city: "Lyon",
    surfaceM2: 1000,
    category: "Logistique sèche",
    latitude: null,
    longitude: null,
    isActive: null,
    ...overrides,
  };
}

const existing = [
  site({ warehouseCode: "A" }),
  site({ warehouseCode: "B" }),
  site({ warehouseCode: "C", isActive: false }),
  site({ warehouseCode: "D" }),
];
const defaults = { fullReferential: false, emptyClearsValue: false };

describe("planImport", () => {
  it("classifies creates, updates, unchanged and reactivations with diffs", () => {
    const plan = planImport(
      [
        row({ line: 2, warehouseCode: "A" }),
        row({ line: 3, warehouseCode: "B", surfaceM2: 2000, city: "Lille" }),
        row({ line: 4, warehouseCode: "C" }),
        row({ line: 5, warehouseCode: "E" }),
      ],
      [],
      existing,
      defaults,
      ALL_FIELDS,
    );
    expect(plan.counts).toEqual({
      create: 1,
      update: 1,
      unchanged: 1,
      reactivate: 1,
      deactivate: 0,
      reject: 0,
    });
    expect(plan.updates[0]?.diff).toEqual({
      surface_m2: { old: 1000, new: 2000 },
      city: { old: "Lyon", new: "Lille" },
    });
    expect(plan.reactivates[0]?.warehouseCode).toBe("C");
    expect(plan.creates[0]?.row.warehouseCode).toBe("E");
  });

  it("rejects every occurrence of a duplicated code and keeps parse errors", () => {
    const plan = planImport(
      [
        row({ line: 2, warehouseCode: "A" }),
        row({ line: 3, warehouseCode: "A" }),
        row({ line: 4, warehouseCode: "B" }),
      ],
      [{ line: 5, code: null, message: "Code entrepôt manquant." }],
      existing,
      defaults,
      ALL_FIELDS,
    );
    expect(plan.counts.reject).toBe(3);
    expect(plan.rejects.map((r) => r.line)).toEqual([2, 3, 5]);
    expect(plan.rejects[0]?.message).toMatch(/lignes 2, 3/);
    expect(plan.counts.unchanged).toBe(1);
  });

  it("keeps stored values for empty cells unless emptyClearsValue is on", () => {
    const rows = [row({ line: 2, warehouseCode: "A", city: null })];
    const kept = planImport(rows, [], existing, defaults, ALL_FIELDS);
    expect(kept.counts.unchanged).toBe(1);
    expect(kept.keptEmptyValues).toBe(1);
    const cleared = planImport(
      rows,
      [],
      existing,
      { ...defaults, emptyClearsValue: true },
      ALL_FIELDS,
    );
    expect(cleared.counts.update).toBe(1);
    expect(cleared.updates[0]?.diff).toEqual({ city: { old: "Lyon", new: null } });
  });

  it("ignores fields absent from the file", () => {
    const plan = planImport(
      [row({ line: 2, warehouseCode: "A", city: null, surfaceM2: null })],
      [],
      existing,
      { ...defaults, emptyClearsValue: true },
      ["warehouse_code", "name"],
    );
    expect(plan.counts.unchanged).toBe(1);
  });

  it("deactivates absent sites only in full referential mode, with the 20 % guard", () => {
    const rows = [row({ line: 2, warehouseCode: "A" })];
    const partial = planImport(rows, [], existing, defaults, ALL_FIELDS);
    expect(partial.counts.deactivate).toBe(0);
    const full = planImport(rows, [], existing, { ...defaults, fullReferential: true }, ALL_FIELDS);
    expect(full.deactivates.map((d) => `${d.warehouseCode}:${d.reason}`)).toEqual([
      "B:absent",
      "D:absent",
    ]);
    expect(full.guard).toEqual({
      activeSites: 3,
      deactivationsByAbsence: 2,
      ratio: 2 / 3,
      requiresConfirmation: true,
    });

    const many = Array.from({ length: 10 }, (_, i) => site({ warehouseCode: `S${i}` }));
    const mild = planImport(
      many.slice(0, 9).map((s, i) => row({ line: i + 2, warehouseCode: s.warehouseCode })),
      [],
      many,
      { ...defaults, fullReferential: true },
      ALL_FIELDS,
    );
    expect(mild.guard.requiresConfirmation).toBe(false);
    expect(mild.counts.deactivate).toBe(1);
  });

  it("deactivates a site explicitly marked inactive and leaves an inactive one unchanged", () => {
    const plan = planImport(
      [
        row({ line: 2, warehouseCode: "A", isActive: false }),
        row({ line: 3, warehouseCode: "C", isActive: false }),
      ],
      [],
      existing,
      defaults,
      ALL_FIELDS,
    );
    expect(plan.deactivates).toEqual([
      { siteId: "id-A", warehouseCode: "A", name: "Site A", reason: "explicit", line: 2 },
    ]);
    expect(plan.counts.unchanged).toBe(1);
  });

  it("compares counts", () => {
    const counts = { create: 1, update: 0, unchanged: 0, reactivate: 0, deactivate: 0, reject: 0 };
    expect(sameCounts(counts, { ...counts })).toBe(true);
    expect(sameCounts(counts, { ...counts, update: 1 })).toBe(false);
  });
});
