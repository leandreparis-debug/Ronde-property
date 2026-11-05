import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ACTORS, actAs, attempt, type Client, connect, inTransaction, USERS } from "./helpers";

/* Migration 20: feedback (« Donner mon avis »). */

let client: Client;

beforeAll(async () => {
  client = await connect();
});

afterAll(async () => {
  await client.end();
});

// No RETURNING: a user who is not admin cannot read the row back (no SELECT policy for them).
const INSERT =
  "insert into public.feedback (id, rating, works, blocks, page_path, app_version, viewport) values ($1, $2, $3, $4, '/visites', '1.0.0', '768x1024')";

let counter = 0;
function newId(): string {
  counter += 1;
  return `f0000000-0000-4000-8000-${String(counter).padStart(12, "0")}`;
}

async function authorOf(id: string): Promise<string | null> {
  await client.query("reset role");
  const { rows } = await client.query<{ author_id: string }>(
    "select author_id from public.feedback where id = $1",
    [id],
  );
  return rows[0]?.author_id ?? null;
}

describe("feedback", () => {
  it("lets any active user give a feedback with only a rating, as its author", async () => {
    for (const actor of ["alice", "claire", "david"] as const) {
      await inTransaction(client, async () => {
        await actAs(client, ACTORS[actor]);
        const id = newId();
        const result = await attempt(client, INSERT, [id, 4, null, null]);
        expect(result.ok, `${actor}: ${JSON.stringify(result)}`).toBe(true);
        expect(await authorOf(id)).toBe(USERS[actor]);
      });
    }
  });

  it("refuses another author, an inactive user and anon", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.alice);
      const forged = await attempt(
        client,
        "insert into public.feedback (author_id, rating, page_path, app_version) values ($1, 5, '/', '1.0.0')",
        [USERS.bruno],
      );
      expect(forged.ok).toBe(false);
    });
    for (const actor of ["inactif", "anon"] as const) {
      await inTransaction(client, async () => {
        await actAs(client, ACTORS[actor]);
        expect((await attempt(client, INSERT, [newId(), 3, null, null])).ok, actor).toBe(false);
      });
    }
  });

  it("checks the rating, the texts and the page", async () => {
    for (const [sql, params] of [
      [INSERT, [newId(), 0, null, null]],
      [INSERT, [newId(), 6, null, null]],
      [INSERT, [newId(), 3, "", null]],
      [INSERT, [newId(), 3, null, "x".repeat(2001)]],
      [
        "insert into public.feedback (rating, page_path, app_version) values (3, 'https://exemple.test', '1.0.0')",
        [],
      ],
    ] as const) {
      await inTransaction(client, async () => {
        await actAs(client, ACTORS.alice);
        expect((await attempt(client, sql, [...params])).ok, JSON.stringify(params)).toBe(false);
      });
    }
  });

  it("is read by the admin only, never modified nor deleted", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.alice);
      const id = newId();
      expect((await attempt(client, INSERT, [id, 2, "Les puces", "Le plan"])).ok).toBe(true);
      const own = await attempt(client, "select id from public.feedback where id = $1", [id]);
      expect(own.ok && own.rowCount).toBe(0);
      for (const actor of ["bruno", "claire"] as const) {
        await actAs(client, ACTORS[actor]);
        const read = await attempt(client, "select id from public.feedback where id = $1", [id]);
        expect(read.ok && read.rowCount, actor).toBe(0);
      }
      await actAs(client, ACTORS.david);
      const admin = await attempt(
        client,
        "select rating, works, blocks from public.feedback where id = $1",
        [id],
      );
      expect(admin.ok && admin.rows[0]).toEqual({
        rating: 2,
        works: "Les puces",
        blocks: "Le plan",
      });
      const update = await attempt(client, "update public.feedback set rating = 5 where id = $1", [
        id,
      ]);
      expect(update.ok && update.rowCount).not.toBe(1);
      const remove = await attempt(client, "delete from public.feedback where id = $1", [id]);
      expect(remove.ok && remove.rowCount).not.toBe(1);
    });
  });
});
