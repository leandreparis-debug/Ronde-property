import { execFileSync, spawnSync } from "node:child_process";

import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/*
 * scripts/ops/purge-demo-data.mjs against a COPY of ronde_test (ronde_test_purge): the seed
 * there is deleted for real, the shared test database is untouched.
 */

const ADMIN = "postgres://postgres:postgres@127.0.0.1:5432/postgres";
const SOURCE = "postgres://postgres:postgres@127.0.0.1:5432/ronde_test";
const COPY = "postgres://postgres:postgres@127.0.0.1:5432/ronde_test_purge";
const KEEP = "admin.david@example.test";

function run(args: string[], input = "") {
  const result = spawnSync("node", ["scripts/ops/purge-demo-data.mjs", ...args], {
    input,
    encoding: "utf8",
    env: { ...process.env, DATABASE_URL: COPY, LOCAL_STORAGE_DIR: ".storage/purge-test" },
  });
  return { code: result.status, out: `${result.stdout}${result.stderr}` };
}

async function query<T extends pg.QueryResultRow>(sql: string, params: unknown[] = []) {
  const client = new pg.Client({ connectionString: COPY });
  await client.connect();
  try {
    return (await client.query<T>(sql, params)).rows;
  } finally {
    await client.end();
  }
}

async function admin(sql: string) {
  const client = new pg.Client({ connectionString: ADMIN });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

beforeAll(async () => {
  await admin("drop database if exists ronde_test_purge");
  await admin("create database ronde_test_purge");
  const dump = execFileSync("pg_dump", ["--no-owner", SOURCE], { maxBuffer: 256 * 1024 * 1024 });
  execFileSync("psql", ["-q", "-v", "ON_ERROR_STOP=1", COPY], { input: dump });
}, 60_000);

afterAll(async () => {
  await admin("drop database if exists ronde_test_purge");
});

describe("scripts/ops/purge-demo-data.mjs", () => {
  it("refuses a wrong target before reading anything", () => {
    const wrong = spawnSync(
      "node",
      [
        "scripts/ops/purge-demo-data.mjs",
        "--project-ref",
        "abcdefghijklmnopqrst",
        "--keep-admin",
        "a@b.fr",
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          DATABASE_URL: "postgresql://postgres:x@db.zyxwvutsrqponmlkjihg.supabase.co:5432/postgres",
        },
      },
    );
    expect(wrong.status).toBe(1);
    expect(`${wrong.stdout}${wrong.stderr}`).toContain("Cible refusée");
    expect(`${wrong.stdout}${wrong.stderr}`).not.toContain("Conservé");
  });

  it("simulates by default: the report, nothing deleted", async () => {
    // --keep-unknown: other suites leave accounts in ronde_test (anonymised contract accounts).
    const { code, out } = run(["--local", "--keep-admin", KEEP, "--keep-unknown", "--dry-run"]);
    expect(code, out).toBe(0);
    expect(out).toContain("SIMULATION");
    expect(out).toMatch(/visits\s+\d+/);
    const rows = await query<{ n: number }>("select count(*)::int as n from public.visits");
    expect(rows[0]?.n).toBeGreaterThan(0);
  });

  it("refuses unknown accounts or sites without --keep-unknown, and real data that depends on demo rows", async () => {
    await query(
      `insert into public.sites (id, warehouse_code, name, address, postal_code, city, is_active, imported_at)
       values ('19999999-0000-4000-8000-000000000001', 'VRAI-001', 'Site réel fictif', '1 rue', '75001', 'Paris', true, now())`,
    );
    const refused = run(["--local", "--keep-admin", KEEP]);
    expect(refused.code).toBe(1);
    expect(refused.out).toContain("--keep-unknown");

    // A real visit on the real site, written by a demo account: the purge would orphan it.
    await query(
      `insert into public.visits (id, site_id, title, visit_date, created_by, writer_id)
       values ('29999999-0000-4000-8000-000000000001', '19999999-0000-4000-8000-000000000001', 'Visite réelle', current_date, $1, $2)`,
      ["00000000-0000-4000-8000-000000000004", "00000000-0000-4000-8000-000000000001"],
    );
    const blocked = run(["--local", "--keep-admin", KEEP, "--keep-unknown"]);
    expect(blocked.code).toBe(1);
    expect(blocked.out).toContain("Visite réelle");
    await query(
      "update public.visits set writer_id = null where id = '29999999-0000-4000-8000-000000000001'",
    );
  });

  it("deletes the demo data after the typed confirmation, keeps the admin and the unknown site", async () => {
    const wrongPhrase = run(
      ["--local", "--keep-admin", KEEP, "--keep-unknown", "--apply"],
      "oui\n",
    );
    expect(wrongPhrase.code).toBe(2);
    const { code, out } = run(
      ["--local", "--keep-admin", KEEP, "--keep-unknown", "--apply"],
      "ronde_test_purge\n",
    );
    expect(code, out).toBe(0);
    expect(out).toContain("aucune référence orpheline");

    const counts = await query<{ table_name: string; n: number }>(`
      select 'sites_test' as table_name, count(*)::int as n from public.sites where warehouse_code like 'TEST-%'
      union all select 'profiles_demo', count(*)::int from public.profiles where email like '%@example.test' and email <> '${KEEP}'
      union all select 'auth_demo', count(*)::int from auth.users where email like '%@example.test' and email <> '${KEEP}'
      union all select 'reserves', count(*)::int from public.reserves
      union all select 'reserve_events', count(*)::int from public.reserve_events
      union all select 'kept_admin', count(*)::int from public.profiles where email = '${KEEP}'
      union all select 'real_site', count(*)::int from public.sites where warehouse_code = 'VRAI-001'
      union all select 'real_visit', count(*)::int from public.visits where title = 'Visite réelle'
      union all select 'audit_purge', count(*)::int from public.audit_log where action = 'system.demo_purged'`);
    expect(Object.fromEntries(counts.map((row) => [row.table_name, row.n]))).toEqual({
      sites_test: 0,
      profiles_demo: 0,
      auth_demo: 0,
      reserves: 0,
      reserve_events: 0,
      kept_admin: 1,
      real_site: 1,
      real_visit: 1,
      audit_purge: 1,
    });
    // Triggers are active again after the purge: the append-only rule still holds.
    await expect(query("delete from public.audit_log")).rejects.toThrow(/ajout seul/);
  });
});
