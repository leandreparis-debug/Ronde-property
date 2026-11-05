import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  ACTORS,
  actAs,
  attempt,
  type Client,
  connect,
  denied,
  inTransaction,
  PLAN_LYON,
  REPORT_V2,
  SITES,
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

async function insertMarker(
  c: Client,
  visitId: string,
  x = 0.5,
): Promise<{ id: string; number: number }> {
  const { rows } = await c.query<{ id: string; number: number }>(
    "insert into public.plan_markers (visit_id, plan_id, page, x, y) values ($1, $2, 1, $3, 0.5) returning id, number",
    [visitId, PLAN_LYON, x],
  );
  return rows[0]!;
}

/** A visit of Alice on Lyon (same site as the seed plan), created in the transaction. */
async function lyonVisit(c: Client, user = USERS.alice): Promise<string> {
  const { rows } = await c.query<{ id: string }>(
    "insert into public.visits (site_id, title, visit_date, created_by) values ($1, 'Visite migration 17', current_date, $2) returning id",
    [SITES.lyon, user],
  );
  return rows[0]!.id;
}

describe("plan_marker_counters (migration 17)", () => {
  it("never gives the number of the last removed marker again", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.alice);
      const visitId = await lyonVisit(client);
      const first = await insertMarker(client, visitId, 0.1);
      const second = await insertMarker(client, visitId, 0.2);
      expect([first.number, second.number]).toEqual([1, 2]);
      await client.query("delete from public.plan_markers where id = $1", [second.id]);
      const third = await insertMarker(client, visitId, 0.3);
      expect(third.number).toBe(3);
      await client.query("delete from public.plan_markers where visit_id = $1", [visitId]);
      expect((await insertMarker(client, visitId)).number).toBe(4);
    });
  });

  it("counts per (visit, plan), raises the counter for an explicit number, keeps numbers immutable", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.alice);
      const visitA = await lyonVisit(client);
      const visitB = await lyonVisit(client);
      expect((await insertMarker(client, visitA)).number).toBe(1);
      expect((await insertMarker(client, visitB)).number).toBe(1);
      const { rows } = await client.query<{ id: string }>(
        "insert into public.plan_markers (visit_id, plan_id, page, x, y, number) values ($1, $2, 1, 0.4, 0.4, 7) returning id",
        [visitA, PLAN_LYON],
      );
      expect((await insertMarker(client, visitA)).number).toBe(8);
      const changed = await attempt(
        client,
        "update public.plan_markers set number = 2 where id = $1",
        [rows[0]!.id],
      );
      expect(denied(changed)).toBe(true);
      // The counter itself is out of reach of the application users.
      expect(
        denied(await attempt(client, "select last_number from public.plan_marker_counters")),
      ).toBe(true);
    });
  });

  it("gives distinct numbers to concurrent inserts from two connections", async () => {
    // Committed rows: a visit of its own, with Bruno as participant so that both can write.
    const visitId = await lyonVisit(client);
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
      const a = await insertMarker(first, visitId, 0.2);
      // The second insert waits for the row lock of the counter.
      const pending = insertMarker(second, visitId, 0.8);
      await new Promise((resolve) => setTimeout(resolve, 200));
      await first.query("commit");
      const b = await pending;
      await second.query("commit");
      expect(b.number).toBe(a.number + 1);
    } finally {
      await first.end();
      await second.end();
      await client.query("delete from public.plan_markers where visit_id = $1", [visitId]);
    }
  });
});

describe("reports (migration 17)", () => {
  it("creates a pending row numbered per visit, with its file name and the draft flag", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.alice);
      const insert = (path: string) =>
        client.query<{
          number: number;
          file_name: string;
          is_draft: boolean;
          upload_status: string;
          size_bytes: number | null;
        }>(
          "insert into public.reports (visit_id, storage_path, generated_by, size_bytes) values ($1, $2, $3, 999) returning number, file_name, is_draft, upload_status, size_bytes",
          [VISITS.v1InProgress, `${VISITS.v1InProgress}/${path}.pdf`, USERS.alice],
        );
      const first = (await insert("m17-a")).rows[0]!;
      const second = (await insert("m17-b")).rows[0]!;
      expect(first.upload_status).toBe("pending");
      expect(first.size_bytes).toBeNull();
      expect(first.is_draft).toBe(true);
      expect(second.number).toBe(first.number + 1);
      expect(first.file_name).toMatch(/^RONDE_TEST-001_\d{4}-\d{2}-\d{2}_\d+\.pdf$/);
      expect(first.file_name.endsWith(`_${first.number}.pdf`)).toBe(true);
    });
  });

  it("is confirmed by its author only, once, with size and page count; then frozen", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.alice);
      const { rows } = await client.query<{ id: string }>(
        "insert into public.reports (visit_id, storage_path, generated_by) values ($1, $2, $3) returning id",
        [VISITS.v1InProgress, `${VISITS.v1InProgress}/m17-confirm.pdf`, USERS.alice],
      );
      const id = rows[0]!.id;
      // Pending: invisible to the others.
      await actAs(client, ACTORS.claire);
      expect(
        (await client.query("select id from public.reports where id = $1", [id])).rowCount,
      ).toBe(0);
      const byClaire = await client.query(
        "update public.reports set upload_status = 'ready', size_bytes = 10, page_count = 1 where id = $1",
        [id],
      );
      expect(byClaire.rowCount).toBe(0);

      await actAs(client, ACTORS.alice);
      const missing = await attempt(
        client,
        "update public.reports set upload_status = 'ready' where id = $1",
        [id],
      );
      expect(!missing.ok && missing.code).toBe("23514");
      const renamed = await attempt(
        client,
        "update public.reports set file_name = 'RONDE_X_2026-01-01_9.pdf' where id = $1",
        [id],
      );
      expect(denied(renamed)).toBe(true);
      expect(
        succeeded(
          await attempt(
            client,
            "update public.reports set upload_status = 'ready', size_bytes = 12345, page_count = 4 where id = $1",
            [id],
          ),
        ),
      ).toBe(true);
      expect(
        (await client.query("select id from public.reports where id = $1", [id])).rowCount,
      ).toBe(1);
      const again = await attempt(
        client,
        "update public.reports set page_count = 5 where id = $1",
        [id],
      );
      expect(denied(again)).toBe(true);
      expect(denied(await attempt(client, "delete from public.reports where id = $1", [id]))).toBe(
        true,
      );

      await actAs(client, ACTORS.claire);
      expect(
        (await client.query("select id from public.reports where id = $1", [id])).rowCount,
      ).toBe(1);
    });
  });

  it("lets every active reader generate (Alice, Emma, Claire, David), never an inactive account", async () => {
    for (const actor of ["alice", "emma", "claire", "david"] as const) {
      await inTransaction(client, async () => {
        await actAs(client, ACTORS[actor]);
        const result = await attempt(
          client,
          "insert into public.reports (visit_id, storage_path, generated_by) values ($1, $2, $3)",
          [VISITS.v2Completed, `${VISITS.v2Completed}/m17-${actor}.pdf`, USERS[actor]],
        );
        expect(succeeded(result), `${actor}: ${JSON.stringify(result)}`).toBe(true);
      });
    }
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.inactif);
      const result = await attempt(
        client,
        "insert into public.reports (visit_id, storage_path, generated_by) values ($1, $2, $3)",
        [VISITS.v2Completed, `${VISITS.v2Completed}/m17-inactif.pdf`, USERS.inactif],
      );
      expect(denied(result)).toBe(true);
    });
  });

  it("purges stale pending rows only, and visit_summaries reads ready reports only", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.alice);
      const { rows } = await client.query<{ id: string }>(
        "insert into public.reports (visit_id, storage_path, generated_by) values ($1, $2, $3) returning id",
        [VISITS.v2Completed, `${VISITS.v2Completed}/m17-stale.pdf`, USERS.alice],
      );
      const { rows: summary } = await client.query<{ last_report_id: string | null }>(
        "select last_report_id from public.visit_summaries where id = $1",
        [VISITS.v2Completed],
      );
      expect(summary[0]!.last_report_id).not.toBe(rows[0]!.id);
      await client.query("reset role");
      // The update trigger refuses any change other than the confirmation: age the row directly.
      await client.query("alter table public.reports disable trigger reports_before_update");
      await client.query(
        "update public.reports set generated_at = now() - interval '2 days' where id = $1",
        [rows[0]!.id],
      );
      await client.query("alter table public.reports enable trigger reports_before_update");
      await actAs(client, ACTORS.service);
      const purged = await client.query<{ id: string; storage_path: string }>(
        "select id, storage_path from private.purge_stale_pending_reports('24 hours')",
      );
      expect(purged.rows.map((r) => r.id)).toContain(rows[0]!.id);
      expect(purged.rows.map((r) => r.id)).not.toContain(REPORT_V2);
      await client.query("reset role");
      expect(
        (await client.query("select id from public.reports where id = $1", [REPORT_V2])).rowCount,
      ).toBe(1);
      await actAs(client, ACTORS.alice);
      const denial = await attempt(
        client,
        "select * from private.purge_stale_pending_reports('1 second')",
      );
      expect(denied(denial)).toBe(true);
    });
  });
});
