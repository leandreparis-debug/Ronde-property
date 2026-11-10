import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { CurrentUser } from "@/server/auth/types";
import { withSystem } from "@/server/db/context";
import { closePool } from "@/server/db/pool";
import { createSiteStructureService } from "@/server/plans/structure-service";
import { LocalStorageService } from "@/server/storage/local";

/*
 * Configuration of a site (step 12 b): « Affecter les pages », outline, order, new image of a
 * level, archive. Rows are committed in ronde_test: every assertion only looks at the rows
 * this test created (a fresh plan each run).
 */

const user = (id: string, role: CurrentUser["role"] = "rt"): CurrentUser => ({
  id,
  email: `${id}@example.test`,
  fullName: "Test",
  role,
  mustChangePassword: false,
});
const ALICE = user("00000000-0000-4000-8000-000000000001");
const CLAIRE = user("00000000-0000-4000-8000-000000000003", "direction");
const SITE = "10000000-0000-4000-8000-000000000003"; // TEST-003 Marseille

let dir = "";
let storage: LocalStorageService;

/** A ready plan of `pages` pages on the site, inserted like a finished import. */
async function importedPlan(pages: number): Promise<string> {
  const id = randomUUID();
  await withSystem("test.site_structure", async (trx) => {
    await trx
      .insertInto("site_plans")
      .values({
        id,
        site_id: SITE,
        name: `Plan structure ${id.slice(0, 6)}`,
        storage_path: `${SITE}/${id}/original.pdf`,
        mime_type: "application/pdf",
        page_count: pages,
        upload_status: "ready",
      })
      .execute();
    for (let page = 1; page <= pages; page += 1) {
      await trx
        .insertInto("site_plan_pages")
        .values({
          plan_id: id,
          page_number: page,
          image_path: `${SITE}/${id}/p${page}.png`,
          thumb_path: `${SITE}/${id}/p${page}_thumb.jpg`,
          image_mime: "image/png",
          width: 3500,
          height: 2475,
          size_bytes: 1000,
        })
        .execute();
    }
  });
  return id;
}

beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "ronde-structure-"));
  storage = new LocalStorageService({ dir, secret: "integration-structure-secret-32-chars-000" });
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
  await closePool();
});

describe("site structure", () => {
  it("assigns a 3-page PDF: exterior view, then Bât. A RDC and R+1 on a new building", async () => {
    const service = createSiteStructureService(ALICE, storage);
    const planId = await importedPlan(3);
    const name = `Bât. A ${planId.slice(0, 4)}`;
    const views = await service.assignPages(SITE, planId, [
      { pageNumber: 1, target: "exterior" },
      { pageNumber: 2, target: "new-building", buildingName: name, label: "RDC" },
      { pageNumber: 3, target: "new-building", buildingName: name, label: "R+1" },
    ]);
    expect(views.map((v) => [v.kind, v.label, v.pageNumber])).toEqual([
      ["exterior", "Vue extérieure", 1],
      ["level", "RDC", 2],
      ["level", "R+1", 3],
    ]);
    // Both levels went to the same new building, from the bottom up.
    expect(views[1]!.buildingId).toBe(views[2]!.buildingId);
    expect(views[2]!.sortOrder).toBeGreaterThan(views[1]!.sortOrder);

    const structure = await service.getStructure(SITE);
    const exterior = structure.views.filter((v) => v.kind === "exterior" && !v.isArchived);
    expect(exterior.map((v) => v.id)).toEqual([views[0]!.id]);
    const page = structure.pages.find((p) => p.planId === planId && p.pageNumber === 2);
    expect(page?.viewId).toBe(views[1]!.id);
  });

  it("traces an outline, refuses a crossed one, and lets the direction read only", async () => {
    const service = createSiteStructureService(ALICE, storage);
    const building = await service.createBuilding(
      SITE,
      `Bâtiment contour ${randomUUID().slice(0, 4)}`,
    );
    const traced = await service.setOutline(building.id, [
      { x: 0.1, y: 0.1 },
      { x: 0.4, y: 0.1 },
      { x: 0.4, y: 0.123456789 },
      { x: 0.1, y: 0.4 },
    ]);
    expect(traced.outline?.[2]).toEqual({ x: 0.4, y: 0.12346 });
    await expect(
      service.setOutline(building.id, [
        { x: 0.1, y: 0.1 },
        { x: 0.5, y: 0.5 },
        { x: 0.5, y: 0.1 },
        { x: 0.1, y: 0.5 },
      ]),
    ).rejects.toThrow(/se croise/);
    const direction = createSiteStructureService(CLAIRE, storage);
    expect((await direction.getStructure(SITE)).buildings.some((b) => b.id === building.id)).toBe(
      true,
    );
    await expect(direction.renameBuilding(building.id, "Pas le droit")).rejects.toThrow();
    const unchanged = (await service.getStructure(SITE)).buildings.find(
      (b) => b.id === building.id,
    );
    expect(unchanged?.name).toBe(building.name);
  });

  it("reorders levels, replaces the image of a level and keeps the old one, archives", async () => {
    const service = createSiteStructureService(ALICE, storage);
    const planId = await importedPlan(3);
    const views = await service.assignPages(SITE, planId, [
      {
        pageNumber: 1,
        target: "new-building",
        buildingName: `Bât. R ${planId.slice(0, 4)}`,
        label: "R+1",
      },
      {
        pageNumber: 2,
        target: "new-building",
        buildingName: `Bât. R ${planId.slice(0, 4)}`,
        label: "RDC",
      },
      { pageNumber: 3, target: "skip" },
    ]);
    const [upper, ground] = views;
    await service.reorderViews(upper!.buildingId!, [ground!.id, upper!.id]);
    let structure = await service.getStructure(SITE);
    const levels = structure.views
      .filter((v) => v.buildingId === upper!.buildingId && !v.isArchived)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    expect(levels.map((v) => v.label)).toEqual(["RDC", "R+1"]);

    // The page used by RDC cannot serve another view.
    await expect(service.replaceViewImage(upper!.id, planId, 2)).rejects.toThrow(/sert déjà/);
    const replaced = await service.replaceViewImage(upper!.id, planId, 3);
    structure = await service.getStructure(SITE);
    const old = structure.views.find((v) => v.id === upper!.id)!;
    expect(old).toMatchObject({ isArchived: true, replacedBy: replaced.id, pageNumber: 1 });
    expect(replaced).toMatchObject({ label: "R+1", pageNumber: 3, isArchived: false });

    await service.setBuildingArchived(upper!.buildingId!, true);
    structure = await service.getStructure(SITE);
    expect(
      structure.views.filter((v) => v.buildingId === upper!.buildingId).every((v) => v.isArchived),
    ).toBe(true);
  });
});
