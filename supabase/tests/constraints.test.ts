import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  ACTORS,
  actAs,
  attempt,
  auditActions,
  type Client,
  connect,
  inTransaction,
  PLAN_LYON,
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

describe("visits and sites", () => {
  it("refuses a visit without site, with an unknown site or with an inactive site", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.alice);
      const noSite = await attempt(
        client,
        "insert into public.visits (site_id, title, visit_date, created_by) values (null, 'Sans site', current_date, $1)",
        [USERS.alice],
      );
      expect(noSite.ok).toBe(false);

      const unknown = await attempt(
        client,
        "insert into public.visits (site_id, title, visit_date, created_by) values (gen_random_uuid(), 'Site inconnu', current_date, $1)",
        [USERS.alice],
      );
      expect(unknown.ok).toBe(false);

      const inactive = await attempt(
        client,
        "insert into public.visits (site_id, title, visit_date, created_by) values ($1, 'Site inactif', current_date, $2)",
        [SITES.rouenInactive, USERS.alice],
      );
      expect(inactive.ok).toBe(false);
      expect(!inactive.ok && inactive.message).toMatch(/site inactif ou inconnu/);
    });
  });

  it("keeps an existing visit readable when its site is deactivated", async () => {
    await inTransaction(client, async () => {
      await client.query("update public.sites set is_active = false where id = $1", [SITES.lyon]);
      await actAs(client, ACTORS.claire);
      const result = await attempt(
        client,
        "select title from public.visit_summaries where id = $1",
        [VISITS.v1InProgress],
      );
      expect(result.ok && result.rowCount).toBe(1);
    });
  });

  it("refuses an empty or too long title", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.alice);
      for (const title of ["", "x".repeat(201)]) {
        const result = await attempt(
          client,
          "insert into public.visits (site_id, title, visit_date, created_by) values ($1, $2, current_date, $3)",
          [SITES.lyon, title, USERS.alice],
        );
        expect(result.ok).toBe(false);
        expect(!result.ok && result.code).toBe("23514");
      }
    });
  });
});

describe("reserves", () => {
  it("refuses an internal responsible without profile and an external one without name", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.alice);
      const internal = await attempt(
        client,
        "insert into public.reserves (visit_id, action, responsible_kind) values ($1, 'Sans profil', 'internal')",
        [VISITS.v1InProgress],
      );
      expect(internal.ok).toBe(false);
      expect(!internal.ok && internal.code).toBe("23514");

      const external = await attempt(
        client,
        "insert into public.reserves (visit_id, action, responsible_kind) values ($1, 'Sans nom', 'external')",
        [VISITS.v1InProgress],
      );
      expect(external.ok).toBe(false);
      expect(!external.ok && external.code).toBe("23514");
    });
  });

  it("validates the responsible email format", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.alice);
      const result = await attempt(
        client,
        "insert into public.reserves (visit_id, action, responsible_kind, responsible_name, responsible_email) values ($1, 'Email invalide', 'external', 'Marc', 'pas-un-email')",
        [VISITS.v1InProgress],
      );
      expect(result.ok).toBe(false);
      expect(!result.ok && result.code).toBe("23514");
    });
  });
});

describe("plan markers and photos", () => {
  it("refuses coordinates outside 0..1", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.alice);
      for (const [x, y] of [
        [1.5, 0.2],
        [0.2, -0.1],
      ]) {
        const result = await attempt(
          client,
          "insert into public.plan_markers (visit_id, plan_id, x, y, number) values ($1, $2, $3, $4, 9)",
          [VISITS.v1InProgress, PLAN_LYON, x, y],
        );
        expect(result.ok).toBe(false);
        expect(!result.ok && result.code).toBe("23514");
      }
    });
  });

  it("refuses a second cover photo on the same visit", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.alice);
      const result = await attempt(
        client,
        "insert into public.photos (visit_id, storage_path, mime_type, is_cover, upload_status) values ($1, $2, 'image/jpeg', true, 'ready')",
        [VISITS.v1InProgress, `${VISITS.v1InProgress}/second-cover.jpg`],
      );
      expect(result.ok).toBe(false);
      expect(!result.ok && result.code).toBe("23505");
    });
  });

  it("refuses an unsupported MIME type", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.alice);
      const result = await attempt(
        client,
        "insert into public.photos (visit_id, storage_path, mime_type) values ($1, $2, 'image/gif')",
        [VISITS.v1InProgress, `${VISITS.v1InProgress}/anim.gif`],
      );
      expect(result.ok).toBe(false);
    });
  });
});

describe("profiles", () => {
  it("refuses a user changing their own role, activation or email", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.alice);
      for (const sql of [
        "update public.profiles set role = 'admin' where id = $1",
        "update public.profiles set is_active = false where id = $1",
        "update public.profiles set email = 'autre@example.test' where id = $1",
      ]) {
        const result = await attempt(client, sql, [USERS.alice]);
        expect(result.ok, sql).toBe(false);
      }
    });
  });

  it("refuses an admin changing another user's role through the normal client", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.david);
      const result = await attempt(
        client,
        "update public.profiles set role = 'admin' where id = $1",
        [USERS.alice],
      );
      expect(result.ok).toBe(false);
    });
  });

  it("lets the service change a role or deactivate a user, with audit entries", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.service);
      await client.query(
        "update public.profiles set role = 'direction', is_active = false where id = $1",
        [USERS.emma],
      );
      const actions = (await auditActions(client, USERS.emma)).filter((action) =>
        action.startsWith("profile."),
      );
      expect(actions).toEqual(["profile.role_changed", "profile.deactivated"]);
      await actAs(client, ACTORS.emma);
      const result = await attempt(client, "select id from public.visits");
      expect(result.ok && result.rowCount).toBe(0);
    });
  });

  it("exposes only id, full_name, role and is_active to users", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.alice);
      expect((await attempt(client, "select email from public.profiles")).ok).toBe(false);
      expect((await attempt(client, "select must_change_password from public.profiles")).ok).toBe(
        false,
      );
      const summary = await attempt(
        client,
        "select id, full_name, role, is_active from public.profiles where id::text like '00000000-0000-4000-8000-%'",
      );
      expect(summary.ok && summary.rowCount).toBe(6);
    });
  });
});

describe("audit coverage", () => {
  it("traces report generation, plan import and archiving, and import runs", async () => {
    await inTransaction(client, async () => {
      await actAs(client, ACTORS.claire);
      const report = await client.query<{ id: string }>(
        "insert into public.reports (visit_id, storage_path, generated_by) values ($1, $2, $3) returning id",
        [VISITS.v2Completed, `${VISITS.v2Completed}/audit.pdf`, USERS.claire],
      );
      expect(await auditActions(client, report.rows[0]!.id)).toEqual(["report.generated"]);

      await actAs(client, ACTORS.alice);
      const plan = await client.query<{ id: string }>(
        "insert into public.site_plans (site_id, name, storage_path, mime_type) values ($1, 'Plan audité', $2, 'application/pdf') returning id",
        [SITES.lyon, `${SITES.lyon}/audit.pdf`],
      );
      await actAs(client, ACTORS.alice);
      await client.query("update public.site_plans set is_archived = true where id = $1", [
        plan.rows[0]!.id,
      ]);
      expect(await auditActions(client, plan.rows[0]!.id)).toEqual([
        "site_plan.imported",
        "site_plan.archived",
      ]);

      await actAs(client, ACTORS.service);
      const run = await client.query<{ id: string }>(
        "insert into public.site_import_runs (file_name, mode, rows_total, performed_by) values ('audit.csv', 'apply', 3, $1) returning id",
        [USERS.david],
      );
      await client.query("reset role");
      const { rows } = await client.query<{ action: string; actor_id: string }>(
        "select action, actor_id from public.audit_log where entity_id = $1",
        [run.rows[0]!.id],
      );
      expect(rows[0]?.action).toBe("site_import.applied");
      expect(rows[0]?.actor_id).toBe(USERS.david);
    });
  });
});
