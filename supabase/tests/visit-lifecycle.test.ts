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

const complete = (id: string) =>
  attempt(client, "select status from public.complete_visit($1)", [id]);
const reopen = (id: string) => attempt(client, "select status from public.reopen_visit($1)", [id]);
const softDelete = (id: string) =>
  attempt(client, "select deleted_at from public.soft_delete_visit($1)", [id]);

describe("complete_visit", () => {
  it("is allowed to the creator, the participant and the admin, with an audit entry", async () => {
    for (const actor of ["alice", "bruno", "david"] as const) {
      await inTransaction(client, async () => {
        await actAs(client, ACTORS[actor]);
        const result = await complete(VISITS.v1InProgress);
        expect(result.ok, `${actor}: ${JSON.stringify(result)}`).toBe(true);
        expect(result.ok && result.rows[0]?.status).toBe("completed");
        expect(await auditActions(client, VISITS.v1InProgress)).toContain("visit.completed");
      });
    }
  });

  it("is refused to a non-participant rt, to direction, to an inactive user and to anon", async () => {
    for (const actor of ["emma", "claire", "inactif", "anon"] as const) {
      await inTransaction(client, async () => {
        await actAs(client, ACTORS[actor]);
        const result = await complete(VISITS.v1InProgress);
        expect(result.ok, actor).toBe(false);
        expect(await auditActions(client, VISITS.v1InProgress)).not.toContain("visit.completed");
      });
    }
  });

  it("is refused on an already completed visit, even for its creator", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.bruno);
      expect((await complete(VISITS.v2Completed)).ok).toBe(false);
    });
  });
});

describe("reopen_visit", () => {
  it("is allowed to the creator and the admin, refused to a participant and to direction", async () => {
    for (const [actor, expected] of [
      ["bruno", true],
      ["david", true],
      ["alice", false],
      ["claire", false],
      ["emma", false],
    ] as const) {
      await inTransaction(client, async () => {
        await actAs(client, ACTORS[actor]);
        const result = await reopen(VISITS.v2Completed);
        expect(result.ok, `${actor}: ${JSON.stringify(result)}`).toBe(expected);
        if (expected) {
          expect(result.ok && result.rows[0]?.status).toBe("in_progress");
          expect(await auditActions(client, VISITS.v2Completed)).toContain("visit.reopened");
        }
      });
    }
  });

  it("is allowed to the writer of the visit", async () => {
    await inTransaction(client, async () => {
      // Make Emma the writer of V2 (as postgres), then reopen as Emma.
      await client.query("update public.visits set writer_id = $1 where id = $2", [
        USERS.emma,
        VISITS.v2Completed,
      ]);
      await actAs(client, ACTORS.emma);
      expect((await reopen(VISITS.v2Completed)).ok).toBe(true);
    });
  });

  it("fails on a visit that is not completed", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.alice);
      const result = await reopen(VISITS.v1InProgress);
      expect(result.ok).toBe(false);
      expect(!result.ok && result.message).toMatch(/pas terminée/);
    });
  });
});

describe("soft_delete_visit", () => {
  it("is allowed to the creator and the admin, refused to a participant, direction and others", async () => {
    for (const [actor, expected] of [
      ["alice", true],
      ["david", true],
      ["bruno", false],
      ["claire", false],
      ["emma", false],
      ["inactif", false],
    ] as const) {
      await inTransaction(client, async () => {
        await actAs(client, ACTORS[actor]);
        const result = await softDelete(VISITS.v1InProgress);
        expect(result.ok, `${actor}: ${JSON.stringify(result)}`).toBe(expected);
        if (expected) {
          expect(result.ok && result.rows[0]?.deleted_at).not.toBeNull();
          expect(await auditActions(client, VISITS.v1InProgress)).toContain("visit.deleted");
        }
      });
    }
  });

  it("hides the visit and its reserves from users but not from the admin", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.alice);
      expect((await softDelete(VISITS.v1InProgress)).ok).toBe(true);
      const alice = await attempt(client, "select id from public.visits where id = $1", [
        VISITS.v1InProgress,
      ]);
      expect(alice.ok && alice.rowCount).toBe(0);
      const reserves = await attempt(client, "select id from public.reserves where visit_id = $1", [
        VISITS.v1InProgress,
      ]);
      expect(reserves.ok && reserves.rowCount).toBe(0);

      await actAs(client, ACTORS.david);
      const admin = await attempt(client, "select deleted_by from public.visits where id = $1", [
        VISITS.v1InProgress,
      ]);
      expect(admin.ok && admin.rows[0]?.deleted_by).toBe(USERS.alice);
    });
  });

  it("cannot be done twice", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.alice);
      expect((await softDelete(VISITS.v3Deleted)).ok).toBe(false);
    });
  });
});

describe("completed visit lock", () => {
  it("refuses every change on a completed visit, even by its creator, until it is reopened", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.bruno);
      const update = await attempt(
        client,
        "update public.visits set title = 'Changé' where id = $1",
        [VISITS.v2Completed],
      );
      expect(denied(update)).toBe(true);
      const note = await attempt(
        client,
        "insert into public.visit_zone_notes (visit_id, zone_key, zone_label) values ($1, 'docks', 'Quais')",
        [VISITS.v2Completed],
      );
      expect(denied(note)).toBe(true);
      const reserve = await attempt(
        client,
        "insert into public.reserves (visit_id, action, responsible_profile_id) values ($1, 'Après clôture', $2)",
        [VISITS.v2Completed, USERS.bruno],
      );
      expect(denied(reserve)).toBe(true);

      expect((await reopen(VISITS.v2Completed)).ok).toBe(true);

      expect(
        succeeded(
          await attempt(
            client,
            "update public.visits set title = 'Changé après réouverture' where id = $1",
            [VISITS.v2Completed],
          ),
        ),
      ).toBe(true);
      expect(
        succeeded(
          await attempt(
            client,
            "insert into public.visit_zone_notes (visit_id, zone_key, zone_label) values ($1, 'docks', 'Quais')",
            [VISITS.v2Completed],
          ),
        ),
      ).toBe(true);
    });
  });

  it("refuses direct changes of status, completed_* and deleted_* outside the RPCs", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.alice);
      for (const sql of [
        "update public.visits set status = 'completed', completed_at = now() where id = $1",
        "update public.visits set deleted_at = now() where id = $1",
        `update public.visits set completed_by = '${USERS.alice}' where id = $1`,
      ]) {
        const result = await attempt(client, sql, [VISITS.v1InProgress]);
        expect(result.ok, sql).toBe(false);
        expect(!result.ok && result.message).toMatch(
          /complete_visit, reopen_visit ou soft_delete_visit/,
        );
      }
    });
  });
});

describe("visit traceability", () => {
  it("increments version and records changed fields in the audit log", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.alice);
      const before = await client.query<{ version: number }>(
        "select version from public.visits where id = $1",
        [VISITS.v1InProgress],
      );
      await client.query(
        "update public.visits set title = 'Titre audité', subject = 'Objet audité' where id = $1",
        [VISITS.v1InProgress],
      );
      const after = await client.query<{ version: number }>(
        "select version from public.visits where id = $1",
        [VISITS.v1InProgress],
      );
      expect(after.rows[0]?.version).toBe((before.rows[0]?.version ?? 0) + 1);

      await client.query("reset role");
      const { rows } = await client.query<{
        actor_id: string;
        details: { changes: Record<string, unknown> };
      }>(
        "select actor_id, details from public.audit_log where entity_id = $1 and action = 'visit.updated' order by id desc limit 1",
        [VISITS.v1InProgress],
      );
      expect(rows[0]?.actor_id).toBe(USERS.alice);
      expect(Object.keys(rows[0]?.details.changes ?? {}).sort()).toEqual(["subject", "title"]);
    });
  });

  it("keeps the site and the creator immutable", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.alice);
      const site = await attempt(client, "update public.visits set site_id = $2 where id = $1", [
        VISITS.v1InProgress,
        "10000000-0000-4000-8000-000000000002",
      ]);
      expect(site.ok).toBe(false);
      const creator = await attempt(
        client,
        "update public.visits set created_by = $2 where id = $1",
        [VISITS.v1InProgress, USERS.bruno],
      );
      expect(creator.ok).toBe(false);
    });
  });
});
