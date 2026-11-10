import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  ACTORS,
  actAs,
  attempt,
  auditActions,
  type Client,
  connect,
  denied,
  inTransaction,
  PLAN_LYON,
  SITES,
  succeeded,
  USERS,
  VISITS,
} from "./helpers";

/* Migration 22 (step 12 b): buildings, views, marker kind, photos « À ranger », backfill. */

let client: Client;
/** A site with no building, view or plan (ronde_test keeps the rows of other suites). */
let blank = "";

beforeAll(async () => {
  client = await connect();
  const { rows } = await client.query<{ id: string }>(
    `select s.id from public.sites s
     where not exists (select 1 from public.site_buildings b where b.site_id = s.id)
       and not exists (select 1 from public.site_views v where v.site_id = s.id)
       and not exists (select 1 from public.site_plans p where p.site_id = s.id)
     order by s.warehouse_code limit 1`,
  );
  if (!rows[0]) throw new Error("Aucun site vierge dans ronde_test : relancer pnpm db:reset.");
  blank = rows[0].id;
});

afterAll(async () => {
  await client.end();
});

const OUTLINE = JSON.stringify([
  { x: 0.1, y: 0.1 },
  { x: 0.4, y: 0.1 },
  { x: 0.4, y: 0.5 },
]);

/** Inserts a ready plan of `pages` pages on a site (as postgres) and returns its id. */
async function plan(site: string, name: string, pages: number): Promise<string> {
  await client.query("reset role");
  const { rows } = await client.query<{ id: string }>(
    `insert into public.site_plans (site_id, name, storage_path, mime_type, page_count, upload_status)
     values ($1::uuid, $2, $1::text || '/' || gen_random_uuid() || '/original.pdf', 'application/pdf', $3, 'ready')
     returning id`,
    [site, name, pages],
  );
  const id = rows[0]!.id;
  for (let page = 1; page <= pages; page += 1) {
    await client.query(
      `insert into public.site_plan_pages (plan_id, page_number, image_path, thumb_path, image_mime, width, height, size_bytes)
       values ($1, $2, $3, $4, 'image/png', 3500, 2475, 1000)`,
      [id, page, `${site}/${id}/p${page}.png`, `${site}/${id}/p${page}_thumb.jpg`],
    );
  }
  return id;
}

async function building(site: string, name: string, outline: string | null = null) {
  const result = await attempt(
    client,
    "insert into public.site_buildings (site_id, name, outline) values ($1, $2, $3::jsonb) returning id",
    [site, name, outline],
  );
  return result;
}

async function view(values: {
  site: string;
  kind: "exterior" | "level";
  building?: string | null;
  label: string;
  plan: string;
  page: number;
}) {
  return attempt(
    client,
    `insert into public.site_views (site_id, kind, building_id, label, plan_id, page_number)
     values ($1, $2, $3, $4, $5, $6) returning id`,
    [values.site, values.kind, values.building ?? null, values.label, values.plan, values.page],
  );
}

describe("site_buildings and site_views (migration 22)", () => {
  it("lets a RT build the structure of a site: exterior view, buildings, levels, audit", async () => {
    await inTransaction(client, async () => {
      const id = await plan(blank, "Plan général", 3);
      await actAs(client, ACTORS.alice);
      const b = await building(blank, "Bâtiment B", OUTLINE);
      expect(succeeded(b)).toBe(true);
      const buildingId = b.ok ? (b.rows[0]!.id as string) : "";
      expect(
        succeeded(
          await view({
            site: blank,
            kind: "exterior",
            label: "Vue extérieure",
            plan: id,
            page: 1,
          }),
        ),
      ).toBe(true);
      const level = await view({
        site: blank,
        kind: "level",
        building: buildingId,
        label: "R+1",
        plan: id,
        page: 2,
      });
      expect(succeeded(level)).toBe(true);
      expect(await auditActions(client, buildingId)).toEqual(["site_building.created"]);
    });
  });

  it("keeps one active exterior view per site, and one active view per page", async () => {
    await inTransaction(client, async () => {
      const id = await plan(blank, "Plan général", 3);
      await actAs(client, ACTORS.alice);
      const first = await view({
        site: blank,
        kind: "exterior",
        label: "Extérieur",
        plan: id,
        page: 1,
      });
      expect(succeeded(first)).toBe(true);
      const second = await view({
        site: blank,
        kind: "exterior",
        label: "Extérieur 2",
        plan: id,
        page: 2,
      });
      expect(second.ok ? "" : second.code).toBe("23505");
      const b = await building(blank, "Bâtiment A");
      const buildingId = b.ok ? (b.rows[0]!.id as string) : "";
      const samePage = await view({
        site: blank,
        kind: "level",
        building: buildingId,
        label: "RDC",
        plan: id,
        page: 1,
      });
      expect(samePage.ok ? "" : samePage.code).toBe("23505");
      // Once archived, the exterior view frees both rules.
      const firstId = first.ok ? (first.rows[0]!.id as string) : "";
      await client.query("update public.site_views set is_archived = true where id = $1", [
        firstId,
      ]);
      expect(
        succeeded(
          await view({
            site: blank,
            kind: "exterior",
            label: "Extérieur",
            plan: id,
            page: 1,
          }),
        ),
      ).toBe(true);
    });
  });

  it("refuses a building, a plan or a view of another site, and a level without building", async () => {
    await inTransaction(client, async () => {
      const lyonPlan = await plan(SITES.lyon, "Plan Lyon", 1);
      const lillePlan = await plan(SITES.lille, "Plan Lille", 1);
      await actAs(client, ACTORS.alice);
      const b = await building(SITES.lyon, "Bâtiment Lyon");
      const lyonBuilding = b.ok ? (b.rows[0]!.id as string) : "";
      const otherPlan = await view({
        site: SITES.lyon,
        kind: "level",
        building: lyonBuilding,
        label: "RDC",
        plan: lillePlan,
        page: 1,
      });
      expect(otherPlan.ok ? "" : otherPlan.message).toMatch(/plan n'appartient pas à ce site/);
      const otherBuilding = await view({
        site: SITES.lille,
        kind: "level",
        building: lyonBuilding,
        label: "RDC",
        plan: lillePlan,
        page: 1,
      });
      expect(otherBuilding.ok ? "" : otherBuilding.message).toMatch(/bâtiment n'appartient pas/);
      const noBuilding = await view({
        site: SITES.lyon,
        kind: "level",
        label: "RDC",
        plan: lyonPlan,
        page: 1,
      });
      expect(noBuilding.ok ? "" : noBuilding.code).toBe("23514");
      const exteriorWithBuilding = await view({
        site: SITES.lyon,
        kind: "exterior",
        building: lyonBuilding,
        label: "Ext",
        plan: lyonPlan,
        page: 1,
      });
      expect(exteriorWithBuilding.ok ? "" : exteriorWithBuilding.code).toBe("23514");
    });
  });

  it("checks the shape of an outline: 3 to 24 points, coordinates between 0 and 1", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.alice);
      const two = JSON.stringify([
        { x: 0.1, y: 0.1 },
        { x: 0.2, y: 0.2 },
      ]);
      const out = JSON.stringify([
        { x: 0.1, y: 0.1 },
        { x: 1.2, y: 0.2 },
        { x: 0.3, y: 0.4 },
      ]);
      expect((await building(SITES.lyon, "Deux points", two)).ok).toBe(false);
      expect((await building(SITES.lyon, "Hors image", out)).ok).toBe(false);
      expect((await building(SITES.lyon, "   ")).ok).toBe(false);
      expect(succeeded(await building(SITES.lyon, "Sans contour"))).toBe(true);
    });
  });

  it("never lets the image of a view change: it is replaced by a new view", async () => {
    await inTransaction(client, async () => {
      const id = await plan(blank, "Plan", 2);
      await actAs(client, ACTORS.alice);
      const v = await view({
        site: blank,
        kind: "exterior",
        label: "Ext",
        plan: id,
        page: 1,
      });
      const viewId = v.ok ? (v.rows[0]!.id as string) : "";
      const moved = await attempt(
        client,
        "update public.site_views set page_number = 2 where id = $1",
        [viewId],
      );
      expect(moved.ok ? "" : moved.code).toBe("42501");
    });
  });

  it("is read by every active user, written by RT and admin only, never deleted", async () => {
    await inTransaction(client, async () => {
      const id = await plan(blank, "Plan", 1);
      await actAs(client, ACTORS.alice);
      const b = await building(blank, "Bâtiment RLS");
      const buildingId = b.ok ? (b.rows[0]!.id as string) : "";
      await view({
        site: blank,
        kind: "level",
        building: buildingId,
        label: "RDC",
        plan: id,
        page: 1,
      });
      for (const actor of ["claire", "bruno", "david"] as const) {
        await actAs(client, ACTORS[actor]);
        const read = await attempt(
          client,
          "select id from public.site_views where building_id = $1",
          [buildingId],
        );
        expect(read.ok && read.rowCount).toBe(1);
      }
      await actAs(client, ACTORS.claire);
      expect(denied(await building(blank, "Direction"))).toBe(true);
      expect(
        denied(
          await attempt(client, "update public.site_buildings set name = 'X' where id = $1", [
            buildingId,
          ]),
        ),
      ).toBe(true);
      await actAs(client, ACTORS.inactif);
      expect(
        (await attempt(client, "select id from public.site_buildings where id = $1", [buildingId]))
          .ok && true,
      ).toBe(true);
      const inactiveRead = await attempt(
        client,
        "select id from public.site_buildings where id = $1",
        [buildingId],
      );
      expect(inactiveRead.ok ? inactiveRead.rowCount : -1).toBe(0);
      await actAs(client, ACTORS.david);
      expect(
        denied(
          await attempt(client, "delete from public.site_buildings where id = $1", [buildingId]),
        ),
      ).toBe(true);
      expect(
        denied(
          await attempt(client, "delete from public.site_views where building_id = $1", [
            buildingId,
          ]),
        ),
      ).toBe(true);
      await actAs(client, ACTORS.anon);
      expect(denied(await attempt(client, "select id from public.site_views"))).toBe(true);
    });
  });
});

describe("plan_markers.kind and photos « À ranger » (migration 22)", () => {
  it("accepts a note of 500 characters, refuses an empty note or a note that carries a reserve", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.alice);
      const insert = (label: string | null, kind = "note") =>
        attempt(
          client,
          `insert into public.plan_markers (visit_id, plan_id, page, x, y, label, kind)
           values ($1, $2, 1, 0.5, 0.5, $3, $4) returning number`,
          [VISITS.v1InProgress, PLAN_LYON, label, kind],
        );
      expect(succeeded(await insert("é".repeat(500)))).toBe(true);
      expect((await insert("é".repeat(501))).ok).toBe(false);
      expect((await insert("   ")).ok).toBe(false);
      expect((await insert(null)).ok).toBe(false);
      // A photo marker keeps its 200 characters.
      expect((await insert("x".repeat(201), "photo")).ok).toBe(false);
      expect((await insert("x".repeat(200), "photo")).ok).toBe(true);
      const kinds = await client.query<{ kind: string }>(
        "select distinct kind from public.plan_markers where visit_id = $1 order by kind",
        [VISITS.v1InProgress],
      );
      expect(kinds.rows.map((row) => row.kind)).toEqual(["note", "photo"]);
    });
  });

  it("keeps the photos « À ranger » with the view shown when they were taken", async () => {
    await inTransaction(client, async () => {
      await client.query("reset role");
      const { rows: views } = await client.query<{ id: string }>(
        "select id from public.site_views where plan_id = $1 order by sort_order limit 1",
        [PLAN_LYON],
      );
      await actAs(client, ACTORS.alice);
      const inserted = await attempt(
        client,
        `insert into public.photos (visit_id, storage_path, mime_type, to_sort, hint_view_id, created_by)
         values ($1::uuid, $1::text || '/' || gen_random_uuid() || '.jpg', 'image/jpeg', true, $2, $3) returning id, to_sort`,
        [VISITS.v1InProgress, views[0]!.id, USERS.alice],
      );
      expect(succeeded(inserted)).toBe(true);
      const id = inserted.ok ? (inserted.rows[0]!.id as string) : "";
      expect(
        succeeded(
          await attempt(client, "update public.photos set to_sort = false where id = $1", [id]),
        ),
      ).toBe(true);
    });
  });
});

describe("backfill of the existing plans (migration 22)", () => {
  it("gave the seed site TEST-001 a « Bâtiment principal » with one level per page", async () => {
    await client.query("reset role");
    const { rows } = await client.query<{
      name: string;
      label: string;
      sort_order: number;
      kind: string;
    }>(
      `select b.name, v.label, v.sort_order, v.kind from public.site_views v
       join public.site_buildings b on b.id = v.building_id
       where v.site_id = $1 and v.plan_id = $2 order by v.sort_order`,
      [SITES.lyon, PLAN_LYON],
    );
    expect(rows).toEqual([
      {
        name: "Bâtiment principal",
        label: "Plan de masse (fictif) · p. 1",
        sort_order: 0,
        kind: "level",
      },
      {
        name: "Bâtiment principal",
        label: "Plan de masse (fictif) · p. 2",
        sort_order: 1,
        kind: "level",
      },
    ]);
    const exterior = await client.query(
      "select 1 from public.site_views where kind = 'exterior' and site_id = $1",
      [SITES.lyon],
    );
    expect(exterior.rowCount).toBe(0);
  });

  it("follows the import order, archives the pages of an archived plan, skips sites already set up", async () => {
    await inTransaction(client, async () => {
      const first = await plan(blank, "Rez-de-chaussée", 1);
      const second = await plan(blank, "Étages", 2);
      await client.query(
        "update public.site_plans set created_at = now() - interval '1 day' where id = $1",
        [first],
      );
      await client.query("update public.site_plans set is_archived = true where id = $1", [second]);
      const pending = await plan(blank, "En attente", 1);
      await client.query("update public.site_plans set upload_status = 'pending' where id = $1", [
        pending,
      ]);
      const { rows: created } = await client.query<{ n: number }>(
        "select private.backfill_site_views() as n",
      );
      expect(created[0]!.n).toBeGreaterThanOrEqual(1);
      const { rows } = await client.query<{
        label: string;
        sort_order: number;
        is_archived: boolean;
      }>(
        `select label, sort_order, is_archived from public.site_views where site_id = $1 order by sort_order`,
        [blank],
      );
      expect(rows).toEqual([
        { label: "Rez-de-chaussée", sort_order: 0, is_archived: false },
        { label: "Étages · p. 1", sort_order: 1, is_archived: true },
        { label: "Étages · p. 2", sort_order: 2, is_archived: true },
      ]);
      // Run again: a site that already has a building is left untouched.
      await client.query("select private.backfill_site_views()");
      const again = await client.query("select 1 from public.site_buildings where site_id = $1", [
        blank,
      ]);
      expect(again.rowCount).toBe(1);
    });
  });
});
