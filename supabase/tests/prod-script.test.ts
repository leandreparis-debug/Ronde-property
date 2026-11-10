import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildProdScript, parseMigrations } from "../../scripts/db/lib/prod-script.mjs";

/*
 * `pnpm db:prod-script`: the generated script is applied, as in the Supabase SQL editor, to a
 * throwaway LOCAL database at the state of the production (migrations before the range, the
 * history table of the Supabase CLI). Never anything remote.
 */

const ROOT = path.resolve(__dirname, "../..");
const BASE = new URL(
  process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/ronde_test",
);
const SCRATCH = "ronde_test_prodscript";

function urlOf(database: string) {
  const url = new URL(BASE);
  if (!["localhost", "127.0.0.1"].includes(url.hostname)) {
    throw new Error("Refus : base locale uniquement.");
  }
  url.pathname = `/${database}`;
  return url.toString();
}

let migrations: ReturnType<typeof parseMigrations>;
let client: pg.Client;

beforeAll(async () => {
  const dir = path.join(ROOT, "supabase", "migrations");
  const names = (await readdir(dir)).filter((name) => name.endsWith(".sql"));
  migrations = parseMigrations(
    await Promise.all(
      names.map(async (file) => ({ file, sql: await readFile(path.join(dir, file), "utf8") })),
    ),
  );
  const maintenance = new pg.Client({ connectionString: urlOf("postgres") });
  await maintenance.connect();
  await maintenance.query(`drop database if exists ${SCRATCH} with (force)`);
  await maintenance.query(`create database ${SCRATCH}`);
  await maintenance.end();

  client = new pg.Client({ connectionString: urlOf(SCRATCH) });
  await client.connect();
  await client.query(await readFile(path.join(ROOT, "supabase/tests/bootstrap.sql"), "utf8"));
  // The production state: every migration but the last one, recorded like the Supabase CLI.
  await client.query(
    "create schema supabase_migrations; create table supabase_migrations.schema_migrations (version text primary key, statements text[], name text)",
  );
  for (const migration of migrations.slice(0, -1)) {
    await client.query(migration.sql);
    await client.query(
      "insert into supabase_migrations.schema_migrations (version, name) values ($1, $2)",
      [migration.version, migration.name],
    );
  }
}, 120_000);

afterAll(async () => {
  await client?.end();
  const maintenance = new pg.Client({ connectionString: urlOf("postgres") });
  await maintenance.connect();
  await maintenance.query(`drop database if exists ${SCRATCH} with (force)`);
  await maintenance.end();
});

async function history() {
  const { rows } = await client.query<{ version: string }>(
    "select version from supabase_migrations.schema_migrations order by version",
  );
  return rows.map((row) => row.version);
}

describe("pnpm db:prod-script", () => {
  it("applies the last migration and records it, in one transaction", async () => {
    const last = migrations.at(-1)!;
    const { sql } = buildProdScript(migrations, last.number, last.number);
    await client.query(sql);
    expect(await history()).toEqual(migrations.map((m) => m.version));
  });

  it("refuses to run twice: the guard stops everything, nothing changes", async () => {
    const last = migrations.at(-1)!;
    const { sql } = buildProdScript(migrations, last.number, last.number);
    await expect(client.query(sql)).rejects.toThrow(/Historique des migrations inattendu/);
    await client.query("rollback");
    expect(await history()).toEqual(migrations.map((m) => m.version));
  });
});
