import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  ACTORS,
  actAs,
  attempt,
  type Client,
  connect,
  inTransaction,
  RESERVES,
  SITES,
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

async function insertReserve(c: Client, visitId: string, action: string, extra = "") {
  const { rows } = await c.query<{ id: string; number: number; site_id: string }>(
    `insert into public.reserves (visit_id, action, responsible_kind, responsible_profile_id ${extra ? "," + extra.split("=")[0] : ""})
     values ($1, $2, 'internal', $3 ${extra ? "," + extra.split("=")[1] : ""})
     returning id, number, site_id`,
    [visitId, action, USERS.alice],
  );
  return rows[0]!;
}

describe("reserve numbering", () => {
  it("is sequential per site and fills site_id from the visit", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.alice);
      const max = await client.query<{ max: number }>(
        "select max(number) from public.reserves where site_id = $1",
        [SITES.lyon],
      );
      const next = Number(max.rows[0]?.max ?? 0) + 1;
      const a = await insertReserve(client, VISITS.v1InProgress, "Réserve A");
      const b = await insertReserve(client, VISITS.v1InProgress, "Réserve B");
      expect(a.number).toBe(next);
      expect(b.number).toBe(next + 1);
      expect(a.site_id).toBe(SITES.lyon);

      // Another site has its own sequence (other suites may already have reserves there).
      await client.query("reset role");
      const marseilleMax = await client.query<{ max: number }>(
        "select max(number) from public.reserves where site_id = $1",
        [SITES.marseille],
      );
      const marseilleNext = Number(marseilleMax.rows[0]?.max ?? 0) + 1;
      const { rows } = await client.query<{ id: string }>(
        "insert into public.visits (site_id, title, visit_date, created_by) values ($1, 'Visite Marseille', current_date, $2) returning id",
        [SITES.marseille, USERS.alice],
      );
      await actAs(client, ACTORS.alice);
      const c = await insertReserve(client, rows[0]!.id, "Réserve Marseille");
      expect(c.number).toBe(marseilleNext);
      expect(c.site_id).toBe(SITES.marseille);
    });
  });

  it("refuses a site_id different from the visit's site", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.alice);
      const result = await attempt(
        client,
        "insert into public.reserves (visit_id, site_id, action, responsible_profile_id) values ($1, $2, 'Mauvais site', $3)",
        [VISITS.v1InProgress, SITES.lille, USERS.alice],
      );
      expect(result.ok).toBe(false);
      expect(!result.ok && result.message).toMatch(/site de la réserve/);
    });
  });

  it("never duplicates a number under concurrent inserts from two connections", async () => {
    // Committed rows cannot be removed afterwards (append-only history), so this test uses a
    // visit of its own on TEST-004, created by Alice with Bruno as participant.
    const { rows: created } = await client.query<{ id: string }>(
      "insert into public.visits (site_id, title, visit_date, created_by) values ($1, 'Test de concurrence', current_date, $2) returning id",
      [SITES.toulouse, USERS.alice],
    );
    const visitId = created[0]!.id;
    await client.query(
      "insert into public.visit_participants (visit_id, profile_id, full_name) values ($1, $2, 'Bruno Fictif')",
      [visitId, USERS.bruno],
    );

    const first = await connect();
    const second = await connect();
    try {
      await first.query("begin");
      await second.query("begin");
      await actAs(first, ACTORS.alice);
      await actAs(second, ACTORS.bruno);

      // The first insert takes the advisory lock; the second one blocks until commit.
      const insertFirst = insertReserve(first, visitId, "Concurrente 1");
      const a = await insertFirst;
      const insertSecond = insertReserve(second, visitId, "Concurrente 2");
      await new Promise((resolve) => setTimeout(resolve, 200));
      await first.query("commit");
      const b = await insertSecond;
      await second.query("commit");

      expect(b.number).toBe(a.number + 1);
      const { rows } = await client.query<{ count: string }>(
        "select count(*) from public.reserves where site_id = $1 and number in ($2, $3)",
        [SITES.toulouse, a.number, b.number],
      );
      expect(Number(rows[0]?.count)).toBe(2);
    } finally {
      await first.end();
      await second.end();
    }
  });
});

describe("reserve closing and history", () => {
  it("sets closed_at and closed_by on done, clears them on reopening, and records events", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.bruno);
      await client.query("update public.reserves set status = 'done' where id = $1", [
        RESERVES.r1Open,
      ]);
      const closed = await client.query<{ closed_at: string | null; closed_by: string | null }>(
        "select closed_at, closed_by from public.reserves where id = $1",
        [RESERVES.r1Open],
      );
      expect(closed.rows[0]?.closed_at).not.toBeNull();
      expect(closed.rows[0]?.closed_by).toBe(USERS.bruno);

      await client.query("update public.reserves set status = 'in_progress' where id = $1", [
        RESERVES.r1Open,
      ]);
      const reopened = await client.query<{ closed_at: string | null; closed_by: string | null }>(
        "select closed_at, closed_by from public.reserves where id = $1",
        [RESERVES.r1Open],
      );
      expect(reopened.rows[0]?.closed_at).toBeNull();
      expect(reopened.rows[0]?.closed_by).toBeNull();

      await client.query(
        "update public.reserves set action = 'Action revue', priority = 'urgent' where id = $1",
        [RESERVES.r1Open],
      );

      const events = await client.query<{
        event_type: string;
        from_status: string | null;
        to_status: string | null;
        changes: Record<string, { old: unknown; new: unknown }>;
        actor_id: string | null;
      }>(
        "select event_type, from_status, to_status, changes, actor_id from public.reserve_events where reserve_id = $1 order by seq",
        [RESERVES.r1Open],
      );
      const types = events.rows.map((e) => e.event_type);
      expect(types[0]).toBe("created");
      expect(types).toEqual(["created", "status_changed", "status_changed", "updated"]);

      const toDone = events.rows[1]!;
      expect(toDone.from_status).toBe("open");
      expect(toDone.to_status).toBe("done");
      expect(toDone.actor_id).toBe(USERS.bruno);

      const updated = events.rows[3]!;
      expect(Object.keys(updated.changes).sort()).toEqual(["action", "priority"]);
      expect(updated.changes.action).toEqual({
        old: "Remplacer les butoirs des quais 14 et 15",
        new: "Action revue",
      });
      expect(updated.changes.priority).toEqual({ old: "high", new: "urgent" });
    });
  });

  it("records a deleted event and hides the reserve after a logical deletion", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.alice);
      const direct = await attempt(
        client,
        "update public.reserves set deleted_at = now() where id = $1",
        [RESERVES.r5External],
      );
      expect(direct.ok).toBe(false);
      await client.query("select public.soft_delete_reserve($1)", [RESERVES.r5External]);
      const visible = await client.query("select id from public.reserves where id = $1", [
        RESERVES.r5External,
      ]);
      expect(visible.rowCount).toBe(0);

      await client.query("reset role");
      const { rows } = await client.query<{ event_type: string; deleted_by: string }>(
        "select e.event_type, r.deleted_by from public.reserve_events e join public.reserves r on r.id = e.reserve_id where e.reserve_id = $1 order by e.seq desc limit 1",
        [RESERVES.r5External],
      );
      expect(rows[0]?.event_type).toBe("deleted");
      expect(rows[0]?.deleted_by).toBe(USERS.alice);
    });
  });
});

describe("is_overdue", () => {
  it("is computed in Europe/Paris around midnight, in winter and in summer", async () => {
    const check = async (due: string, status: string, at: string) => {
      const { rows } = await client.query<{ overdue: boolean }>(
        "select private.is_reserve_overdue($1::date, $2::public.reserve_status, $3::timestamptz) as overdue",
        [due, status, at],
      );
      return rows[0]?.overdue;
    };
    // Winter (UTC+1): 23:30 UTC on 10 March is already 11 March in Paris.
    expect(await check("2026-03-10", "open", "2026-03-10T23:30:00Z")).toBe(true);
    expect(await check("2026-03-10", "open", "2026-03-10T22:30:00Z")).toBe(false);
    // Summer (UTC+2): 22:30 UTC on 10 July is already 11 July in Paris.
    expect(await check("2026-07-10", "open", "2026-07-10T22:30:00Z")).toBe(true);
    expect(await check("2026-07-10", "open", "2026-07-10T21:30:00Z")).toBe(false);
    // The due date itself is not overdue; a done reserve never is; no due date never is.
    expect(await check("2026-07-11", "in_progress", "2026-07-11T10:00:00Z")).toBe(false);
    expect(await check("2026-03-10", "done", "2026-03-20T10:00:00Z")).toBe(false);
    const { rows } = await client.query<{ overdue: boolean }>(
      "select private.is_reserve_overdue(null, 'open'::public.reserve_status, now()) as overdue",
    );
    expect(rows[0]?.overdue).toBe(false);
  });

  it("is exposed by reserves_with_state with the display code", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.claire);
      const { rows } = await client.query<{ code: string; is_overdue: boolean; status: string }>(
        // Seed reserves only: e2e runs and manual checks add reserves to V1.
        "select code, is_overdue, status from public.reserves_with_state where visit_id = $1 and id = any($2::uuid[]) order by number",
        [VISITS.v1InProgress, Object.values(RESERVES)],
      );
      expect(rows.map((r) => r.code)).toEqual(["R-01", "R-02", "R-03", "R-04", "R-05"]);
      expect(rows.map((r) => r.is_overdue)).toEqual([false, false, false, true, false]);
    });
  });

  it("feeds the visit_summaries counters", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.claire);
      const { rows } = await client.query<Record<string, number | string>>(
        "select id, site_code, open_reserves_count, overdue_reserves_count, done_reserves_count, photos_count, last_report_at from public.visit_summaries order by visit_date",
      );
      expect(rows.length).toBeGreaterThanOrEqual(2);
      // Seed visits by id: integration tests add visits on the same sites.
      const v1 = rows.find((r) => r.id === VISITS.v1InProgress)!;
      // V1 is shared with the e2e runs: compare with a direct count instead of fixed numbers.
      const { rows: direct } = await client.query<Record<string, number>>(
        `select
           count(*) filter (where status <> 'done')::int as open,
           count(*) filter (where status <> 'done' and due_date < (now() at time zone 'Europe/Paris')::date)::int as overdue,
           count(*) filter (where status = 'done')::int as done
         from public.reserves where visit_id = $1 and deleted_at is null`,
        [VISITS.v1InProgress],
      );
      expect(v1.open_reserves_count).toBe(direct[0]!.open);
      expect(v1.overdue_reserves_count).toBe(direct[0]!.overdue);
      expect(v1.done_reserves_count).toBe(direct[0]!.done);
      expect(Number(v1.open_reserves_count)).toBeGreaterThanOrEqual(4);
      expect(Number(v1.photos_count)).toBeGreaterThanOrEqual(1);
      const v2 = rows.find((r) => r.id === VISITS.v2Completed)!;
      expect(v2.last_report_at).not.toBeNull();
    });
  });
});
