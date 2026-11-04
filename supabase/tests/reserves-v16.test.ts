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
  RESERVES,
  succeeded,
  USERS,
  VISITS,
} from "./helpers";

let client: Client;

beforeAll(async () => {
  client = await connect();
});

afterAll(async () => {
  await client.end();
});

async function version(id: string): Promise<number> {
  const { rows } = await client.query<{ version: number }>(
    "select version from public.reserves where id = $1",
    [id],
  );
  return rows[0]!.version;
}

/** A second visit on the Lyon site (same site as V1), editable by Alice, created in the transaction. */
async function otherLyonVisit(): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    "insert into public.visits (site_id, title, visit_date, created_by) select site_id, 'Autre visite Lyon', current_date, $2 from public.visits where id = $1 returning id",
    [VISITS.v1InProgress, USERS.alice],
  );
  return rows[0]!.id;
}

describe("reserves.version (migration 16)", () => {
  it("starts at 1 and increments on every update, without an extra history entry", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.alice);
      const before = await version(RESERVES.r1Open);
      await client.query(
        "update public.reserves set action = 'Remplacer les butoirs 14 à 16' where id = $1",
        [RESERVES.r1Open],
      );
      expect(await version(RESERVES.r1Open)).toBe(before + 1);
      await client.query("update public.reserves set status = 'done' where id = $1", [
        RESERVES.r1Open,
      ]);
      expect(await version(RESERVES.r1Open)).toBe(before + 2);
      await client.query("reset role");
      const { rows } = await client.query<{ changes: Record<string, unknown> }>(
        "select changes from public.reserve_events where reserve_id = $1 and event_type = 'updated' order by seq desc limit 1",
        [RESERVES.r1Open],
      );
      expect(Object.keys(rows[0]!.changes)).toEqual(["action"]);
    });
  });

  it("supports a compare-and-set update on the version", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.alice);
      const current = await version(RESERVES.r1Open);
      const stale = await attempt(
        client,
        "update public.reserves set action = 'x' where id = $1 and version = $2",
        [RESERVES.r1Open, current - 1],
      );
      expect(stale.ok && stale.rowCount).toBe(0);
      const fresh = await attempt(
        client,
        "update public.reserves set action = 'y' where id = $1 and version = $2",
        [RESERVES.r1Open, current],
      );
      expect(succeeded(fresh)).toBe(true);
    });
  });
});

describe("optional responsible (migration 16)", () => {
  it("accepts « À désigner » and keeps internal / external consistent", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.alice);
      const none = await attempt(
        client,
        "insert into public.reserves (visit_id, action) values ($1, 'Sans responsable') returning id",
        [VISITS.v1InProgress],
      );
      expect(succeeded(none)).toBe(true);
      for (const [sql, params] of [
        // internal without profile
        [
          "insert into public.reserves (visit_id, action, responsible_kind) values ($1, 'x', 'internal')",
          [VISITS.v1InProgress],
        ],
        // external without name
        [
          "insert into public.reserves (visit_id, action, responsible_kind, responsible_company) values ($1, 'x', 'external', 'ACME')",
          [VISITS.v1InProgress],
        ],
        // external with blank name
        [
          "insert into public.reserves (visit_id, action, responsible_kind, responsible_name) values ($1, 'x', 'external', '   ')",
          [VISITS.v1InProgress],
        ],
        // no kind but a name
        [
          "insert into public.reserves (visit_id, action, responsible_name) values ($1, 'x', 'Nom seul')",
          [VISITS.v1InProgress],
        ],
        // internal with an external e-mail
        [
          "insert into public.reserves (visit_id, action, responsible_kind, responsible_profile_id, responsible_email) values ($1, 'x', 'internal', $2, 'a@example.test')",
          [VISITS.v1InProgress, USERS.bruno],
        ],
        // invalid e-mail
        [
          "insert into public.reserves (visit_id, action, responsible_kind, responsible_name, responsible_email) values ($1, 'x', 'external', 'Nom', 'pas-un-email')",
          [VISITS.v1InProgress],
        ],
      ] as const) {
        const result = await attempt(client, sql, [...params]);
        expect(!result.ok && result.code, sql).toBe("23514");
      }
      const external = await attempt(
        client,
        "insert into public.reserves (visit_id, action, responsible_kind, responsible_name, responsible_company, responsible_email) values ($1, 'x', 'external', 'Marc Imaginaire', 'ACME Fictive', 'marc@example.test')",
        [VISITS.v1InProgress],
      );
      expect(succeeded(external)).toBe(true);
    });
  });
});

describe("plan_markers.reserve_id (migration 16)", () => {
  it("links a reserve of the same visit, at most once, and refuses another visit", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.alice);
      const first = await attempt(
        client,
        "insert into public.plan_markers (visit_id, plan_id, page, x, y, number, reserve_id) values ($1, $2, 1, 0.2, 0.2, 70, $3)",
        [VISITS.v1InProgress, PLAN_LYON, RESERVES.r1Open],
      );
      expect(succeeded(first)).toBe(true);
      const second = await attempt(
        client,
        "insert into public.plan_markers (visit_id, plan_id, page, x, y, number, reserve_id) values ($1, $2, 1, 0.3, 0.3, 71, $3)",
        [VISITS.v1InProgress, PLAN_LYON, RESERVES.r1Open],
      );
      expect(!second.ok && second.code).toBe("23505");

      const otherVisit = await otherLyonVisit();
      const { rows } = await client.query<{ id: string }>(
        "insert into public.reserves (visit_id, action) values ($1, 'Autre visite') returning id",
        [otherVisit],
      );
      const foreign = await attempt(
        client,
        "insert into public.plan_markers (visit_id, plan_id, page, x, y, number, reserve_id) values ($1, $2, 1, 0.4, 0.4, 72, $3)",
        [VISITS.v1InProgress, PLAN_LYON, rows[0]!.id],
      );
      expect(!foreign.ok && foreign.message).toMatch(/même visite/);
    });
  });

  it("deletes the marker with the reserve in soft_delete_reserve, and keeps the number unused", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.alice);
      const { rows: created } = await client.query<{ id: string; number: number }>(
        "insert into public.reserves (visit_id, action) values ($1, 'À supprimer') returning id, number",
        [VISITS.v1InProgress],
      );
      const reserve = created[0]!;
      await client.query(
        "insert into public.plan_markers (visit_id, plan_id, page, x, y, number, reserve_id) values ($1, $2, 1, 0.5, 0.5, 73, $3)",
        [VISITS.v1InProgress, PLAN_LYON, reserve.id],
      );
      // A direct physical delete of the reserve is refused (no delete grant, restrict FK).
      expect(
        denied(await attempt(client, "delete from public.reserves where id = $1", [reserve.id])),
      ).toBe(true);
      await client.query("select public.soft_delete_reserve($1)", [reserve.id]);
      await client.query("reset role");
      const markers = await client.query(
        "select id from public.plan_markers where reserve_id = $1",
        [reserve.id],
      );
      expect(markers.rowCount).toBe(0);
      await actAs(client, ACTORS.alice);
      const { rows: next } = await client.query<{ number: number }>(
        "insert into public.reserves (visit_id, action) values ($1, 'Suivante') returning number",
        [VISITS.v1InProgress],
      );
      expect(next[0]!.number).toBe(reserve.number + 1);
    });
  });

  it("refuses to link a deleted reserve", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.alice);
      const { rows } = await client.query<{ id: string }>(
        "insert into public.reserves (visit_id, action) values ($1, 'Supprimée') returning id",
        [VISITS.v1InProgress],
      );
      await client.query("select public.soft_delete_reserve($1)", [rows[0]!.id]);
      const result = await attempt(
        client,
        "insert into public.plan_markers (visit_id, plan_id, page, x, y, number, reserve_id) values ($1, $2, 1, 0.5, 0.5, 74, $3)",
        [VISITS.v1InProgress, PLAN_LYON, rows[0]!.id],
      );
      expect(result.ok).toBe(false);
    });
  });
});

describe("reserve_photos checks (migration 16)", () => {
  it("accepts a photo of the same visit as defect, refuses proof and another visit's photo", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.alice);
      const defect = await attempt(
        client,
        "insert into public.reserve_photos (reserve_id, photo_id, kind) values ($1, $2, 'defect')",
        [RESERVES.r4Overdue, PHOTO_V1],
      );
      expect(succeeded(defect)).toBe(true);
      const proof = await attempt(
        client,
        "insert into public.reserve_photos (reserve_id, photo_id, kind) values ($1, $2, 'proof')",
        [RESERVES.r5External, PHOTO_V1],
      );
      expect(!proof.ok && proof.code).toBe("23514");

      const otherVisit = await otherLyonVisit();
      const { rows } = await client.query<{ id: string }>(
        "insert into public.photos (visit_id, storage_path, mime_type, upload_status) values ($1, $2, 'image/jpeg', 'ready') returning id",
        [otherVisit, `${otherVisit}/other.jpg`],
      );
      const foreign = await attempt(
        client,
        "insert into public.reserve_photos (reserve_id, photo_id, kind) values ($1, $2, 'defect')",
        [RESERVES.r2InProgress, rows[0]!.id],
      );
      expect(!foreign.ok && foreign.message).toMatch(/même visite/);
    });
  });
});

describe("reserves_with_state (migration 16)", () => {
  it("exposes days_overdue, the responsible name, photos and the marker", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.alice);
      await client.query(
        "insert into public.plan_markers (visit_id, plan_id, page, x, y, number, reserve_id) values ($1, $2, 2, 0.5, 0.5, 75, $3)",
        [VISITS.v1InProgress, PLAN_LYON, RESERVES.r4Overdue],
      );
      const { rows } = await client.query<{
        id: string;
        code: string;
        is_overdue: boolean;
        days_overdue: number;
        responsible_display_name: string | null;
        responsible_is_active: boolean | null;
        photos_count: number;
        first_thumb_path: string | null;
        marker_plan_id: string | null;
        marker_page: number | null;
        version: number;
      }>(
        `select id, code, is_overdue, days_overdue, responsible_display_name, responsible_is_active,
                photos_count, first_thumb_path, marker_plan_id, marker_page, version
         from public.reserves_with_state where visit_id = $1 order by number`,
        [VISITS.v1InProgress],
      );
      const byId = new Map(rows.map((r) => [r.id, r]));
      const overdue = byId.get(RESERVES.r4Overdue)!;
      expect(overdue.is_overdue).toBe(true);
      expect(overdue.days_overdue).toBe(15);
      expect(overdue.responsible_display_name).toBe("Alice Fictive");
      expect(overdue.responsible_is_active).toBe(true);
      expect(overdue.marker_plan_id).toBe(PLAN_LYON);
      expect(overdue.marker_page).toBe(2);
      const done = byId.get(RESERVES.r3Done)!;
      expect([done.is_overdue, done.days_overdue]).toEqual([false, 0]);
      const withPhoto = byId.get(RESERVES.r1Open)!;
      expect(withPhoto.photos_count).toBe(1);
      expect(withPhoto.first_thumb_path).toMatch(/_thumb\.jpg$/);
      expect(byId.get(RESERVES.r5External)!.responsible_display_name).toBeNull();
      expect(rows.every((r) => r.version >= 1)).toBe(true);
    });
  });

  it("keeps the name of a deactivated internal responsible, flagged inactive", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.alice);
      await client.query("update public.reserves set responsible_profile_id = $2 where id = $1", [
        RESERVES.r2InProgress,
        USERS.inactif,
      ]);
      const { rows } = await client.query<{ name: string; active: boolean }>(
        "select responsible_display_name as name, responsible_is_active as active from public.reserves_with_state where id = $1",
        [RESERVES.r2InProgress],
      );
      expect(rows[0]).toEqual({ name: "Inactif Fictif", active: false });
    });
  });
});
