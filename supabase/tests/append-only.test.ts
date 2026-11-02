import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ACTORS, actAs, attempt, type Client, connect, inTransaction } from "./helpers";

let client: Client;

beforeAll(async () => {
  client = await connect();
});

afterAll(async () => {
  await client.end();
});

const WRITERS = ["service", "postgres", "david", "alice"] as const;

describe("audit_log is append-only", () => {
  for (const actor of WRITERS) {
    it(`${actor} cannot update it`, async () => {
      await inTransaction(client, async () => {
        await actAs(client, ACTORS[actor]);
        const result = await attempt(
          client,
          "update public.audit_log set action = 'test.tampered'",
        );
        expect(result.ok).toBe(false);
      });
    });

    it(`${actor} cannot delete from it`, async () => {
      await inTransaction(client, async () => {
        await actAs(client, ACTORS[actor]);
        const result = await attempt(client, "delete from public.audit_log");
        expect(result.ok).toBe(false);
      });
    });

    it(`${actor} cannot insert into it directly`, async () => {
      await inTransaction(client, async () => {
        await actAs(client, ACTORS[actor]);
        const result = await attempt(
          client,
          "insert into public.audit_log (action, entity_type) values ('test.direct', 'test')",
        );
        expect(result.ok).toBe(false);
      });
    });
  }

  it("rejects truncate", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.service);
      expect((await attempt(client, "truncate public.audit_log")).ok).toBe(false);
    });
  });
});

describe("reserve_events is append-only", () => {
  for (const actor of WRITERS) {
    it(`${actor} cannot update, delete or insert directly`, async () => {
      await inTransaction(client, async () => {
        await actAs(client, ACTORS[actor]);
        expect((await attempt(client, "update public.reserve_events set changes = '{}'")).ok).toBe(
          false,
        );
        expect((await attempt(client, "delete from public.reserve_events")).ok).toBe(false);
        expect(
          (
            await attempt(
              client,
              "insert into public.reserve_events (reserve_id, event_type) values ('50000000-0000-4000-8000-000000000001', 'updated')",
            )
          ).ok,
        ).toBe(false);
      });
    });
  }

  it("is still fed by the triggers when a reserve changes", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.alice);
      const before = await client.query("select count(*) from public.reserve_events");
      await client.query(
        "update public.reserves set priority = 'low' where id = '50000000-0000-4000-8000-000000000002'",
      );
      const after = await client.query("select count(*) from public.reserve_events");
      expect(Number(after.rows[0].count)).toBe(Number(before.rows[0].count) + 1);
    });
  });
});
