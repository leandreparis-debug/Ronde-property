import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ACTORS, actAs, attempt, type Client, connect, inTransaction, USERS } from "./helpers";

let client: Client;

beforeAll(async () => {
  client = await connect();
});

afterAll(async () => {
  await client.end();
});

const MESSAGE = /RONDE: un compte ne se supprime pas, il se désactive \(historique attribué\)/;

describe("profiles are never deleted", () => {
  for (const actor of ["postgres", "service", "david", "alice"] as const) {
    it(`${actor} cannot delete a profile`, async () => {
      await inTransaction(client, async () => {
        await actAs(client, ACTORS[actor]);
        const result = await attempt(client, "delete from public.profiles where id = $1", [
          USERS.emma,
        ]);
        expect(result.ok).toBe(false);
        if (actor === "postgres" || actor === "service") {
          expect(!result.ok && result.message).toMatch(MESSAGE);
        }
      });
    });
  }

  it("blocks the cascade from auth.users with the same message", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.postgres);
      const result = await attempt(client, "delete from auth.users where id = $1", [USERS.emma]);
      expect(result.ok).toBe(false);
      expect(!result.ok && result.message).toMatch(MESSAGE);
    });
  });

  it("keeps deactivation possible for the service", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.service);
      const result = await attempt(
        client,
        "update public.profiles set is_active = false where id = $1",
        [USERS.emma],
      );
      expect(result.ok && result.rowCount).toBe(1);
    });
  });

  it("references profiles with on delete restrict from the history tables", async () => {
    const { rows } = await client.query<{ table_name: string; delete_rule: string }>(`
      select tc.table_name, rc.delete_rule
      from information_schema.table_constraints tc
      join information_schema.referential_constraints rc on rc.constraint_name = tc.constraint_name
      where tc.constraint_name in (
        'audit_log_actor_id_fkey', 'reserve_events_actor_id_fkey',
        'reports_generated_by_fkey', 'site_import_runs_performed_by_fkey'
      )
      order by tc.table_name
    `);
    expect(rows.map((r) => `${r.table_name}:${r.delete_rule}`)).toEqual([
      "audit_log:RESTRICT",
      "reports:RESTRICT",
      "reserve_events:RESTRICT",
      "site_import_runs:RESTRICT",
    ]);
  });
});
