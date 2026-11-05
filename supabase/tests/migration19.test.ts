import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  ACTORS,
  actAs,
  attempt,
  type Client,
  connect,
  inTransaction,
  RESERVES,
  USERS,
  VISITS,
} from "./helpers";

/* Migration 19: GDPR (anonymisation, external e-mails, no e-mail in the reserve history). */

let client: Client;

beforeAll(async () => {
  client = await connect();
});

afterAll(async () => {
  await client.end();
});

describe("reserve history", () => {
  it("records that the external e-mail changed, never its value", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.postgres);
      await client.query("update public.reserves set responsible_email = $2 where id = $1", [
        RESERVES.r5External,
        "nouveau.contact@prestataire-fictif.test",
      ]);
      const { rows } = await client.query<{ changes: Record<string, unknown> }>(
        `select changes from public.reserve_events
         where reserve_id = $1 and created_at >= now() order by seq desc limit 1`,
        [RESERVES.r5External],
      );
      expect(rows[0]?.changes).toEqual({
        responsible_email: { old: "[masqué]", new: "[masqué]" },
      });
      expect(JSON.stringify(rows)).not.toContain("@");
    });
  });
});

describe("anonymize_profile", () => {
  it("refuses an active account", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.service);
      const result = await attempt(client, "select private.anonymize_profile($1, $2)", [
        USERS.emma,
        USERS.david,
      ]);
      expect(result.ok).toBe(false);
      expect(!result.ok && result.message).toMatch(/déjà désactivé/);
    });
  });

  it("replaces the name and e-mail of a deactivated account and of its participations, audited", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.postgres);
      await client.query(
        `insert into public.visit_participants (visit_id, profile_id, full_name, email, company, sort_order)
         values ($1, $2, 'Ines Active', 'rt.inactif@example.test', 'Carrefour Property (fictif)', 10)`,
        [VISITS.v1InProgress, USERS.inactif],
      );
      await actAs(client, ACTORS.service);
      await client.query("select private.anonymize_profile($1, $2)", [USERS.inactif, USERS.david]);
      await client.query("reset role");

      const profile = await client.query<{
        full_name: string;
        email: string;
        anonymized_at: Date | null;
        sessions_revoked_at: Date | null;
      }>(
        "select full_name, email, anonymized_at, sessions_revoked_at from public.profiles where id = $1",
        [USERS.inactif],
      );
      expect(profile.rows[0]?.full_name).toMatch(/^Compte anonymisé [0-9A-F]{6}$/);
      expect(profile.rows[0]?.email).toBe(
        `anonyme+${USERS.inactif.replaceAll("-", "")}@ronde.invalid`,
      );
      expect(profile.rows[0]?.anonymized_at).not.toBeNull();
      expect(profile.rows[0]?.sessions_revoked_at).not.toBeNull();

      const participants = await client.query<{ full_name: string; email: string | null }>(
        "select full_name, email from public.visit_participants where profile_id = $1",
        [USERS.inactif],
      );
      expect(participants.rows).toEqual([{ full_name: profile.rows[0]!.full_name, email: null }]);

      const audit = await client.query<{ actor_id: string; details: unknown }>(
        `select actor_id, details from public.audit_log
         where action = 'profile.anonymized' and entity_id = $1 and occurred_at >= now()`,
        [USERS.inactif],
      );
      expect(audit.rows).toEqual([{ actor_id: USERS.david, details: {} }]);
    });
  });

  it("is irreversible: no reactivation, no new name, no second anonymisation", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.service);
      await client.query("select private.anonymize_profile($1, $2)", [USERS.inactif, USERS.david]);
      for (const statement of [
        "update public.profiles set is_active = true where id = $1",
        "update public.profiles set full_name = 'Ines Active' where id = $1",
        "update public.profiles set anonymized_at = null where id = $1",
        "select private.anonymize_profile($1, null)",
      ]) {
        const result = await attempt(client, statement, [USERS.inactif]);
        expect(result.ok, statement).toBe(false);
      }
    });
  });

  it("is out of reach of signed-in users, even admins", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.david);
      const result = await attempt(client, "select private.anonymize_profile($1, $2)", [
        USERS.inactif,
        USERS.david,
      ]);
      expect(result.ok).toBe(false);
      const direct = await attempt(
        client,
        "update public.profiles set anonymized_at = now() where id = $1",
        [USERS.david],
      );
      expect(direct.ok && direct.rowCount).not.toBe(1);
    });
  });
});

describe("clear_external_responsible_emails", () => {
  async function prepareOldDoneReserve() {
    await actAs(client, ACTORS.postgres);
    await client.query("update public.reserves set status = 'done' where id = $1", [
      RESERVES.r5External,
    ]);
    await client.query(
      "update public.reserves set closed_at = now() - interval '30 months' where id = $1",
      [RESERVES.r5External],
    );
  }

  async function email(): Promise<string | null> {
    const { rows } = await client.query<{ responsible_email: string | null }>(
      "select responsible_email from public.reserves where id = $1",
      [RESERVES.r5External],
    );
    return rows[0]?.responsible_email ?? null;
  }

  it("simulates by default: counts, changes nothing", async () => {
    await inTransaction(client, async () => {
      await prepareOldDoneReserve();
      await actAs(client, ACTORS.service);
      const { rows } = await client.query<{ count: number }>(
        "select private.clear_external_responsible_emails(24, false) as count",
      );
      expect(rows[0]?.count).toBeGreaterThanOrEqual(1);
      await client.query("reset role");
      expect(await email()).not.toBeNull();
    });
  });

  it("clears only reserves done for longer than N months, with an audit entry", async () => {
    await inTransaction(client, async () => {
      await prepareOldDoneReserve();
      await actAs(client, ACTORS.service);
      const recent = await client.query<{ count: number }>(
        "select private.clear_external_responsible_emails(36, true) as count",
      );
      await client.query("reset role");
      expect(await email()).not.toBeNull();
      await actAs(client, ACTORS.service);
      const applied = await client.query<{ count: number }>(
        "select private.clear_external_responsible_emails(24, true) as count",
      );
      expect(applied.rows[0]!.count).toBeGreaterThanOrEqual(1);
      await client.query("reset role");
      expect(await email()).toBeNull();
      const audit = await client.query<{ details: { months: number; count: number } }>(
        `select details from public.audit_log
         where action = 'rgpd.external_emails_cleared' and occurred_at >= now() order by id`,
      );
      expect(audit.rows.map((row) => row.details)).toEqual([
        { months: 36, count: recent.rows[0]!.count },
        { months: 24, count: applied.rows[0]!.count },
      ]);
    });
  });

  it("refuses a period under one month, and signed-in users", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.service);
      expect(
        (await attempt(client, "select private.clear_external_responsible_emails(0, false)")).ok,
      ).toBe(false);
    });
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.david);
      expect(
        (await attempt(client, "select private.clear_external_responsible_emails(24, false)")).ok,
      ).toBe(false);
    });
  });
});
