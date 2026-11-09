import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ACTORS, actAs, attempt, type Client, connect, inTransaction, USERS } from "./helpers";

/* Migration 21: sync_operations (idempotence of POST /api/sync) and its purge. */

let client: Client;

beforeAll(async () => {
  client = await connect();
});

afterAll(async () => {
  await client.end();
});

const INSERT =
  "insert into public.sync_operations (user_id, op_id, applied_at, result) values ($1, $2, $3, $4::jsonb)";

describe("sync_operations (migration 21)", () => {
  it("is written and read by the service only", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.service);
      const id = "019a0000-0000-7000-8000-000000000001";
      const inserted = await attempt(client, INSERT, [
        USERS.alice,
        id,
        new Date().toISOString(),
        JSON.stringify({ status: "applied", version: 3 }),
      ]);
      expect(inserted.ok).toBe(true);
      const twice = await attempt(client, INSERT, [
        USERS.alice,
        id,
        new Date().toISOString(),
        "{}",
      ]);
      expect(twice.ok).toBe(false);
      expect(twice.ok ? "" : twice.code).toBe("23505");
      for (const actor of ["alice", "david", "claire", "anon"] as const) {
        await actAs(client, ACTORS[actor]);
        const read = await attempt(
          client,
          "select op_id from public.sync_operations where op_id = $1",
          [id],
        );
        expect(read.ok, actor).toBe(false);
        const write = await attempt(client, INSERT, [
          USERS.bruno,
          "019a0000-0000-7000-8000-000000000002",
          new Date().toISOString(),
          "{}",
        ]);
        expect(write.ok, actor).toBe(false);
      }
    });
  });

  it("purges the entries older than the given age, and keeps the recent ones", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.service);
      const old = "019a0000-0000-7000-8000-00000000000a";
      const recent = "019a0000-0000-7000-8000-00000000000b";
      await client.query(INSERT, [
        USERS.alice,
        old,
        new Date(Date.now() - 40 * 86_400_000).toISOString(),
        "{}",
      ]);
      await client.query(INSERT, [USERS.alice, recent, new Date().toISOString(), "{}"]);
      const purged = await attempt(
        client,
        "select private.purge_sync_operations(interval '30 days') as removed",
      );
      expect(purged.ok && Number(purged.rows[0]?.removed)).toBeGreaterThanOrEqual(1);
      const { rows } = await client.query<{ op_id: string }>(
        "select op_id from public.sync_operations where op_id in ($1, $2)",
        [old, recent],
      );
      expect(rows.map((row) => row.op_id)).toEqual([recent]);
      await actAs(client, ACTORS.alice);
      const refused = await attempt(client, "select private.purge_sync_operations()");
      expect(refused.ok).toBe(false);
    });
  });
});
