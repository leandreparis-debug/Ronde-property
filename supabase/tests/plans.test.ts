import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  ACTORS,
  actAs,
  attempt,
  type Client,
  connect,
  denied,
  inTransaction,
  PHOTO_V1,
  PLAN_LYON,
  SITES,
  succeeded,
  VISITS,
} from "./helpers";

let client: Client;

beforeAll(async () => {
  client = await connect();
});

afterAll(async () => {
  await client.end();
});

/**
 * Inserts a plan as the current actor (pending, with its first page unless `withPage` is
 * false), then marks it ready when asked: pages can only be added while the plan is pending.
 */
async function insertPlan(
  siteId: string,
  name: string,
  options: { status?: "pending" | "ready"; ageHours?: number; withPage?: boolean } = {},
) {
  const plan = await attempt(
    client,
    `insert into public.site_plans (site_id, name, storage_path, mime_type, uploaded_by, created_at)
     values ($1, $2, $3, 'application/pdf', auth.uid(), now() - make_interval(hours => $4)) returning id`,
    [siteId, name, `${siteId}/${name}/original.pdf`, options.ageHours ?? 0],
  );
  if (!plan.ok) return { plan, pageInserted: null };
  const id = plan.rows[0]!.id as string;
  let pageInserted = null;
  if (options.withPage !== false) {
    pageInserted = await attempt(
      client,
      `insert into public.site_plan_pages (plan_id, page_number, image_path, thumb_path, image_mime, width, height, size_bytes)
       values ($1, 1, $2, $3, 'image/png', 3500, 2475, 1000)`,
      [id, `${siteId}/${name}/p1.png`, `${siteId}/${name}/p1_thumb.jpg`],
    );
  }
  if (options.status === "ready") {
    await client.query("update public.site_plans set upload_status = 'ready' where id = $1", [id]);
  }
  return { plan, pageInserted, id };
}

describe("site_plans.upload_status and site_plan_pages (migration 15)", () => {
  it("creates a plan as pending, visible to its author only, then to everyone once ready", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.alice);
      const { plan, id } = await insertPlan(SITES.lyon, "mine");
      expect(succeeded(plan)).toBe(true);
      const mine = await attempt(client, "select id from public.site_plans where id = $1", [id]);
      expect(mine.ok && mine.rowCount).toBe(1);

      await actAs(client, ACTORS.bruno);
      const theirs = await attempt(client, "select id from public.site_plans where id = $1", [id]);
      expect(theirs.ok && theirs.rowCount).toBe(0);

      await actAs(client, ACTORS.alice);
      expect(
        succeeded(
          await attempt(
            client,
            "update public.site_plans set upload_status = 'ready' where id = $1",
            [id],
          ),
        ),
      ).toBe(true);
      await actAs(client, ACTORS.claire);
      const now = await attempt(client, "select id from public.site_plans where id = $1", [id]);
      expect(now.ok && now.rowCount).toBe(1);
    });
  });

  it("lets rt/admin add pages while the plan is pending, and freezes them once ready", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.david);
      const { pageInserted, id } = await insertPlan(SITES.lyon, "frozen");
      expect(succeeded(pageInserted!)).toBe(true);
      await client.query("update public.site_plans set upload_status = 'ready' where id = $1", [
        id,
      ]);
      const more = await attempt(
        client,
        `insert into public.site_plan_pages (plan_id, page_number, image_path, thumb_path, image_mime, width, height, size_bytes)
         values ($1, 2, $2, $3, 'image/jpeg', 100, 100, 10)`,
        [id, `${SITES.lyon}/frozen/p2.jpg`, `${SITES.lyon}/frozen/p2_thumb.jpg`],
      );
      expect(denied(more)).toBe(true);
      expect(
        denied(
          await attempt(client, "delete from public.site_plan_pages where plan_id = $1", [id]),
        ),
      ).toBe(true);
      // Pages stay readable by every active user with the plan.
      await actAs(client, ACTORS.claire);
      const read = await attempt(
        client,
        "select id from public.site_plan_pages where plan_id = $1",
        [id],
      );
      expect(read.ok && read.rowCount).toBe(1);
    });
  });

  it("refuses Claire (direction) on plans and pages", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.claire);
      const { plan } = await insertPlan(SITES.lyon, "claire");
      expect(denied(plan)).toBe(true);
      const page = await attempt(
        client,
        `insert into public.site_plan_pages (plan_id, page_number, image_path, thumb_path, image_mime, width, height, size_bytes)
         values ($1, 3, 'x/p3.png', 'x/p3_thumb.jpg', 'image/png', 10, 10, 10)`,
        [PLAN_LYON],
      );
      expect(denied(page)).toBe(true);
    });
  });

  it("enforces one row per (plan, page) and positive dimensions", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.alice);
      const { id } = await insertPlan(SITES.lyon, "dims");
      const duplicate = await attempt(
        client,
        `insert into public.site_plan_pages (plan_id, page_number, image_path, thumb_path, image_mime, width, height, size_bytes)
         values ($1, 1, 'dup/p1.png', 'dup/p1_thumb.jpg', 'image/png', 10, 10, 10)`,
        [id],
      );
      expect(!duplicate.ok && duplicate.code).toBe("23505");
      const zero = await attempt(
        client,
        `insert into public.site_plan_pages (plan_id, page_number, image_path, thumb_path, image_mime, width, height, size_bytes)
         values ($1, 2, 'dup/p2.png', 'dup/p2_thumb.jpg', 'image/png', 0, 10, 10)`,
        [id],
      );
      expect(!zero.ok && zero.code).toBe("23514");
    });
  });
});

describe("plan_markers checks (migration 15)", () => {
  async function insertMarker(values: {
    visitId: string;
    planId: string;
    page: number;
    photoId?: string | null;
    number: number;
  }) {
    return attempt(
      client,
      "insert into public.plan_markers (visit_id, plan_id, page, x, y, number, photo_id) values ($1, $2, $3, 0.5, 0.5, $4, $5)",
      [values.visitId, values.planId, values.page, values.number, values.photoId ?? null],
    );
  }

  it("accepts a marker on an existing page, at the exact edges, and refuses a missing page", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.alice);
      expect(
        succeeded(
          await insertMarker({
            visitId: VISITS.v1InProgress,
            planId: PLAN_LYON,
            page: 2,
            number: 9050,
          }),
        ),
      ).toBe(true);
      const edge = await attempt(
        client,
        "insert into public.plan_markers (visit_id, plan_id, page, x, y, number) values ($1, $2, 1, 0, 1, 9051)",
        [VISITS.v1InProgress, PLAN_LYON],
      );
      expect(succeeded(edge)).toBe(true);
      const missing = await insertMarker({
        visitId: VISITS.v1InProgress,
        planId: PLAN_LYON,
        page: 3,
        number: 52,
      });
      expect(!missing.ok && missing.code).toBe("23514");
      expect(!missing.ok && missing.message).toMatch(/page n'existe pas/);
    });
  });

  it("refuses a photo of another visit and accepts one of the same visit", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.bruno);
      const wrong = await insertMarker({
        visitId: VISITS.v2Completed,
        planId: PLAN_LYON,
        page: 1,
        number: 53,
        photoId: PHOTO_V1,
      });
      expect(wrong.ok).toBe(false);
      await actAs(client, ACTORS.alice);
      const right = await insertMarker({
        visitId: VISITS.v1InProgress,
        planId: PLAN_LYON,
        page: 1,
        number: 54,
        photoId: PHOTO_V1,
      });
      expect(succeeded(right)).toBe(true);
    });
  });

  it("refuses a plan of another site, a pending plan and an archived plan for new markers", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.david);
      const { id: otherSitePlan } = await insertPlan(SITES.lille, "other-site", {
        status: "ready",
      });
      const other = await insertMarker({
        visitId: VISITS.v1InProgress,
        planId: otherSitePlan!,
        page: 1,
        number: 55,
      });
      expect(!other.ok && other.message).toMatch(/site de la visite/);

      const { id: pendingPlan } = await insertPlan(SITES.lyon, "still-pending");
      const pending = await insertMarker({
        visitId: VISITS.v1InProgress,
        planId: pendingPlan!,
        page: 1,
        number: 56,
      });
      expect(!pending.ok && pending.message).toMatch(/pas encore disponible/);

      const { id: archivedPlan } = await insertPlan(SITES.lyon, "archived", { status: "ready" });
      await client.query("update public.site_plans set is_archived = true where id = $1", [
        archivedPlan,
      ]);
      const archived = await insertMarker({
        visitId: VISITS.v1InProgress,
        planId: archivedPlan!,
        page: 1,
        number: 57,
      });
      expect(!archived.ok && archived.message).toMatch(/archivé/);
      // Existing markers of an archived plan can still be updated (label, position).
      await client.query("update public.site_plans set is_archived = true where id = $1", [
        PLAN_LYON,
      ]);
      await actAs(client, ACTORS.alice);
      const moved = await attempt(
        client,
        "update public.plan_markers set x = 0.1 where visit_id = $1 and plan_id = $2 and number = 1",
        [VISITS.v1InProgress, PLAN_LYON],
      );
      expect(succeeded(moved)).toBe(true);
    });
  });

  it("sets photo_id to null when the photo is deleted", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.alice);
      const photo = await client.query<{ id: string }>(
        "insert into public.photos (visit_id, storage_path, mime_type, upload_status) values ($1, $2, 'image/jpeg', 'ready') returning id",
        [VISITS.v1InProgress, `${VISITS.v1InProgress}/for-marker.jpg`],
      );
      const photoId = photo.rows[0]!.id;
      const marker = await insertMarker({
        visitId: VISITS.v1InProgress,
        planId: PLAN_LYON,
        page: 1,
        number: 58,
        photoId,
      });
      expect(succeeded(marker)).toBe(true);
      await client.query("delete from public.photos where id = $1", [photoId]);
      const { rows } = await client.query<{ photo_id: string | null }>(
        "select photo_id from public.plan_markers where visit_id = $1 and plan_id = $2 and number = 58",
        [VISITS.v1InProgress, PLAN_LYON],
      );
      expect(rows[0]?.photo_id).toBeNull();
    });
  });
});

describe("audit and purge (migration 15)", () => {
  it("audits the import when the plan becomes ready, then renames and archives", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.alice);
      const { id } = await insertPlan(SITES.lyon, "audited");
      await client.query("update public.site_plans set upload_status = 'ready' where id = $1", [
        id,
      ]);
      await client.query("update public.site_plans set name = 'Renommé' where id = $1", [id]);
      await client.query("update public.site_plans set is_archived = true where id = $1", [id]);
      await client.query("reset role");
      const { rows } = await client.query<{ action: string }>(
        "select action from public.audit_log where entity_id = $1 order by id",
        [id],
      );
      expect(rows.map((r) => r.action)).toEqual([
        "site_plan.imported",
        "site_plan.renamed",
        "site_plan.archived",
      ]);
    });
  });

  it("purges stale pending plans with their page paths, service_role only", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.alice);
      const { id: stale } = await insertPlan(SITES.lyon, "stale", { ageHours: 30 });
      const { id: fresh } = await insertPlan(SITES.lyon, "fresh");
      const { id: ready } = await insertPlan(SITES.lyon, "old-ready", {
        ageHours: 30,
        status: "ready",
      });

      const forbidden = await attempt(
        client,
        "select * from private.purge_stale_pending_plans(interval '24 hours')",
      );
      expect(!forbidden.ok && forbidden.code).toBe("42501");

      await actAs(client, ACTORS.service);
      const purged = await attempt(
        client,
        "select id, storage_path, page_paths from private.purge_stale_pending_plans(interval '24 hours')",
      );
      expect(purged.ok).toBe(true);
      const row = purged.ok ? purged.rows.find((r) => r.id === stale) : undefined;
      expect(row?.storage_path).toBe(`${SITES.lyon}/stale/original.pdf`);
      expect((row?.page_paths as string[]).sort()).toEqual([
        `${SITES.lyon}/stale/p1.png`,
        `${SITES.lyon}/stale/p1_thumb.jpg`,
      ]);
      await client.query("reset role");
      const { rows } = await client.query<{ id: string }>(
        "select id from public.site_plans where id = any($1::uuid[]) order by id",
        [[stale, fresh, ready]],
      );
      expect(rows.map((r) => r.id).sort()).toEqual([fresh, ready].sort());
      const pages = await client.query("select id from public.site_plan_pages where plan_id = $1", [
        stale,
      ]);
      expect(pages.rowCount).toBe(0);
    });
  });
});
