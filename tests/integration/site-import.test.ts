import { readFileSync } from "node:fs";
import path from "node:path";

import { sql } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { withSystem, withUser } from "@/server/db/context";
import { closePool } from "@/server/db/pool";
import { ForbiddenError, ValidationError } from "@/server/errors";
import { createSiteRepository } from "@/server/repositories/site-repository";
import { applyImport, parseSitesCsv, simulateImport } from "@/server/sites/import";

const DAVID = "00000000-0000-4000-8000-000000000004";
const ALICE = { id: "00000000-0000-4000-8000-000000000001" };
const SAMPLE = readFileSync(path.join(process.cwd(), "docs/samples/sites-vigie-exemple.csv"));
const OPTIONS = { fullReferential: false, emptyClearsValue: false };

async function resetSites() {
  // Restore the seed state of the sites touched by the sample (test only, as postgres).
  await withSystem("test.reset_sites", async (trx) => {
    // Visits created on these sites by other suites (acceptance C1) would block the delete.
    await sql`delete from public.visits where site_id in (select id from public.sites where warehouse_code >= 'TEST-013')`.execute(
      trx,
    );
    await sql`delete from public.sites where warehouse_code >= 'TEST-013'`.execute(trx);
    await sql`update public.sites set surface_m2 = 42000.00, imported_at = now() where warehouse_code = 'TEST-001'`.execute(
      trx,
    );
    await sql`update public.sites set is_active = false, name = 'Entrepôt fictif Rouen (fermé)' where warehouse_code = 'TEST-012'`.execute(
      trx,
    );
  });
}

beforeAll(resetSites);
afterAll(async () => {
  await resetSites();
  await closePool();
});

describe("site import on the sample", () => {
  const parse = parseSitesCsv(SAMPLE, "sites-vigie-exemple.csv");

  it("simulates without writing sites and records a simulate run", async () => {
    const report = await simulateImport(parse, OPTIONS, DAVID);
    expect(report.mode).toBe("simulate");
    expect(report.plan.counts).toEqual({
      create: 6,
      update: 1,
      unchanged: 2,
      reactivate: 1,
      deactivate: 0,
      reject: 5,
    });
    expect(report.plan.updates[0]?.diff).toEqual({ surface_m2: { old: 42000, new: 43000 } });
    expect(report.plan.rejects.map((r) => r.line)).toEqual([10, 12, 13, 14, 15]);
    const nimes = await withSystem("test.check", (trx) =>
      trx
        .selectFrom("sites")
        .select("id")
        .where("warehouse_code", "=", "TEST-013")
        .executeTakeFirst(),
    );
    expect(nimes).toBeUndefined();
    const run = await withSystem("test.run", (trx) =>
      trx
        .selectFrom("site_import_runs")
        .select(["mode", "file_sha256", "rows_rejected"])
        .where("id", "=", report.runId)
        .executeTakeFirstOrThrow(),
    );
    expect(run).toEqual({ mode: "simulate", file_sha256: parse.sha256, rows_rejected: 5 });
  });

  it("refuses to apply when the fingerprint or the counts differ from the simulation", async () => {
    const simulated = await simulateImport(parse, OPTIONS, DAVID);
    await expect(
      applyImport(parse, OPTIONS, DAVID, { sha256: "0".repeat(64), counts: simulated.plan.counts }),
    ).rejects.toThrow(/relancez la simulation/);
    await expect(
      applyImport(parse, OPTIONS, DAVID, {
        sha256: parse.sha256,
        counts: { ...simulated.plan.counts, create: 99 },
      }),
    ).rejects.toThrow(/relancez la simulation/);
  });

  it("refuses a mass deactivation without explicit confirmation", async () => {
    const full = { ...OPTIONS, fullReferential: true };
    const simulated = await simulateImport(parse, full, DAVID);
    expect(simulated.plan.guard.requiresConfirmation).toBe(true);
    expect(simulated.plan.counts.deactivate).toBe(8);
    await expect(
      applyImport(parse, full, DAVID, { sha256: parse.sha256, counts: simulated.plan.counts }),
    ).rejects.toThrow(/désactivation massive/);
  });

  it("rolls everything back when a failure happens inside the transaction", async () => {
    const simulated = await simulateImport(parse, OPTIONS, DAVID);
    const countApplyRuns = () =>
      withSystem("test.runs", async (trx) => {
        const row = await trx
          .selectFrom("site_import_runs")
          .select((eb) => eb.fn.countAll<string>().as("count"))
          .where("mode", "=", "apply")
          .where("file_sha256", "=", parse.sha256)
          .executeTakeFirstOrThrow();
        return Number(row.count);
      });
    const runsBefore = await countApplyRuns();
    await expect(
      applyImport(
        parse,
        OPTIONS,
        DAVID,
        { sha256: parse.sha256, counts: simulated.plan.counts },
        false,
        {
          beforeCommit: async () => {
            throw new Error("panne simulée");
          },
        },
      ),
    ).rejects.toThrow();
    const created = await withSystem("test.check", (trx) =>
      trx
        .selectFrom("sites")
        .select("id")
        .where("warehouse_code", "=", "TEST-013")
        .executeTakeFirst(),
    );
    expect(created).toBeUndefined();
    expect(await countApplyRuns()).toBe(runsBefore);
  });

  it("applies in one transaction with a run line and an audit entry, then a second import is all unchanged", async () => {
    const simulated = await simulateImport(parse, OPTIONS, DAVID);
    const report = await applyImport(parse, OPTIONS, DAVID, {
      sha256: parse.sha256,
      counts: simulated.plan.counts,
    });
    expect(report.mode).toBe("apply");

    const sites = await withSystem("test.sites", (trx) =>
      trx
        .selectFrom("sites")
        .select(["warehouse_code", "name", "postal_code", "surface_m2", "is_active", "city"])
        .where("warehouse_code", "in", [
          "TEST-001",
          "TEST-012",
          "TEST-013",
          "TEST-014",
          "TEST-015",
          "TEST-021",
        ])
        .orderBy("warehouse_code")
        .execute(),
    );
    expect(sites).toEqual([
      {
        warehouse_code: "TEST-001",
        name: "Entrepôt fictif Lyon Sud",
        postal_code: "69800",
        surface_m2: 43000,
        is_active: true,
        city: "Saint-Priest",
      },
      {
        warehouse_code: "TEST-012",
        name: "Entrepôt fictif Rouen",
        postal_code: "76000",
        surface_m2: 12000,
        is_active: true,
        city: "Rouen",
      },
      {
        warehouse_code: "TEST-013",
        name: "Entrepôt fictif Nîmes",
        postal_code: "30000",
        surface_m2: 18250.75,
        is_active: true,
        city: "Nîmes",
      },
      {
        warehouse_code: "TEST-014",
        name: "Entrepôt fictif Bourg-en-Bresse",
        postal_code: "01000",
        surface_m2: 9800,
        is_active: true,
        city: "Bourg-en-Bresse",
      },
      {
        warehouse_code: "TEST-015",
        name: "Plateforme fictive Nancy",
        postal_code: "54000",
        surface_m2: 12500.5,
        is_active: true,
        city: "Nancy",
      },
      {
        warehouse_code: "TEST-021",
        name: "Entrepôt fictif Reims",
        postal_code: "51100",
        surface_m2: 15000,
        is_active: false,
        city: "Reims",
      },
    ]);

    const audit = await withSystem("test.audit", (trx) =>
      trx
        .selectFrom("audit_log")
        .select(["action", "actor_id"])
        .where("entity_id", "=", report.runId)
        .executeTakeFirstOrThrow(),
    );
    expect(audit).toEqual({ action: "site_import.applied", actor_id: DAVID });

    const again = await simulateImport(parse, OPTIONS, DAVID);
    expect(again.plan.counts).toEqual({
      create: 0,
      update: 0,
      unchanged: 10,
      reactivate: 0,
      deactivate: 0,
      reject: 5,
    });
  });

  it("refuses when the repository changed between the simulation and the application", async () => {
    await resetSites();
    const simulated = await simulateImport(parse, OPTIONS, DAVID);
    await withSystem("test.concurrent", (trx) =>
      trx
        .updateTable("sites")
        .set({ surface_m2: 43000 })
        .where("warehouse_code", "=", "TEST-001")
        .execute(),
    );
    await expect(
      applyImport(parse, OPTIONS, DAVID, { sha256: parse.sha256, counts: simulated.plan.counts }),
    ).rejects.toThrow(/relancez la simulation/);
  });
});

describe("site search", () => {
  beforeAll(async () => {
    await resetSites();
    const parse = parseSitesCsv(SAMPLE, "sites-vigie-exemple.csv");
    const simulated = await simulateImport(parse, OPTIONS, DAVID);
    await applyImport(parse, OPTIONS, DAVID, {
      sha256: parse.sha256,
      counts: simulated.plan.counts,
    });
  });

  const repository = createSiteRepository(ALICE);

  it("finds « Nîmes » with « nimes » and « NÎMES », and ranks the exact code first", async () => {
    for (const q of ["nimes", "NÎMES", "nîmes"]) {
      const result = await repository.search({ q });
      expect(result.items[0]?.warehouseCode).toBe("TEST-013");
    }
    const byCode = await repository.search({ q: "test-002" });
    expect(byCode.items[0]?.warehouseCode).toBe("TEST-002");
  });

  it("paginates the full list, excludes inactive sites by default and escapes wildcards", async () => {
    const page1 = await repository.search({ pageSize: 5 });
    expect(page1.items).toHaveLength(5);
    expect(page1.total).toBeGreaterThanOrEqual(17);
    expect(page1.pageCount).toBe(Math.ceil(page1.total / 5));
    const page2 = await repository.search({ pageSize: 5, page: 2 });
    expect(page2.items[0]?.id).not.toBe(page1.items[0]?.id);

    const active = await repository.search({ q: "reims" });
    expect(active.items).toHaveLength(0);
    const withInactive = await repository.search({ q: "reims", includeInactive: true });
    expect(withInactive.items[0]?.warehouseCode).toBe("TEST-021");

    const wildcard = await repository.search({ q: "%" });
    expect(wildcard.total).toBe(0);
    const long = await repository.search({ q: "x".repeat(500) });
    expect(long.total).toBe(0);
  });

  it("filters by category and lists categories", async () => {
    const categories = await repository.listCategories();
    expect(categories).toContain("Frais");
    const frais = await repository.search({ category: "Frais" });
    expect(frais.items.every((site) => site.category === "Frais")).toBe(true);
    expect(frais.total).toBeGreaterThanOrEqual(3);
  });

  it("lets an rt read sites but not write them through withUser", async () => {
    expect(await repository.getByCode("test-001")).toMatchObject({ warehouseCode: "TEST-001" });
    expect(await repository.getByCode("TEST-999")).toBeNull();
    await expect(
      withUser(ALICE, (trx) =>
        trx
          .updateTable("sites")
          .set({ name: "Piraté" })
          .where("warehouse_code", "=", "TEST-001")
          .executeTakeFirst(),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      withUser(ALICE, (trx) =>
        trx.insertInto("sites").values({ warehouse_code: "HACK-1", name: "x" }).execute(),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      withUser(ALICE, (trx) =>
        trx.deleteFrom("sites").where("warehouse_code", "=", "TEST-001").executeTakeFirst(),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("validation errors reach the caller", () => {
  it("rejects an invalid file before any database access", () => {
    expect(() => parseSitesCsv(new TextEncoder().encode("Ville\nLyon\n"), "x.csv")).toThrow(
      ValidationError,
    );
  });
});
