import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ACTORS, actAs, attempt, type Client, connect, inTransaction, USERS } from "./helpers";

/* Migration 18: profiles.sessions_revoked_at (« Déconnecter toutes les sessions »). */

let client: Client;

beforeAll(async () => {
  client = await connect();
});

afterAll(async () => {
  await client.end();
});

async function revokedAt(id: string): Promise<Date | null> {
  const { rows } = await client.query<{ sessions_revoked_at: Date | null }>(
    "select sessions_revoked_at from public.profiles where id = $1",
    [id],
  );
  return rows[0]?.sessions_revoked_at ?? null;
}

describe("sessions_revoked_at", () => {
  it("is set (to the second) when an account is deactivated, and audited", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.service);
      await client.query("update public.profiles set is_active = false where id = $1", [
        USERS.emma,
      ]);
      await client.query("reset role");
      const value = await revokedAt(USERS.emma);
      expect(value).not.toBeNull();
      expect(value!.getMilliseconds()).toBe(0);
      const { rows } = await client.query<{ details: { reason: string } }>(
        `select details from public.audit_log
         where action = 'profile.sessions_revoked' and entity_id = $1
         order by occurred_at desc limit 1`,
        [USERS.emma],
      );
      expect(rows[0]?.details.reason).toBe("deactivated");
    });
  });

  it("can be set by the service, never by the user nor read by other users", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.alice);
      const own = await attempt(
        client,
        "update public.profiles set sessions_revoked_at = null where id = $1",
        [USERS.alice],
      );
      expect(own.ok).toBe(false);
      const read = await attempt(client, "select sessions_revoked_at from public.profiles");
      expect(read.ok).toBe(false);
    });
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.service);
      const result = await attempt(
        client,
        "update public.profiles set sessions_revoked_at = date_trunc('second', now()) where id = $1",
        [USERS.alice],
      );
      expect(result.ok && result.rowCount).toBe(1);
    });
  });
});
