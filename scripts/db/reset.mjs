/**
 * Resets the local TEST database: drops and recreates `ronde_test`, then applies
 * supabase/tests/bootstrap.sql, every migration in order, and supabase/seed.sql.
 *
 * Safety: refuses to run unless DATABASE_URL points to localhost / 127.0.0.1 and the
 * database name is exactly `ronde_test`. It can never touch a real Supabase project.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_URL = "postgres://postgres:postgres@127.0.0.1:5432/ronde_test";
const ALLOWED_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const REQUIRED_DB = "ronde_test";

export function assertSafeDatabaseUrl(rawUrl) {
  const url = new URL(rawUrl);
  const database = url.pathname.replace(/^\//, "");
  if (!ALLOWED_HOSTS.has(url.hostname)) {
    throw new Error(
      `Refus : DATABASE_URL pointe sur « ${url.hostname} ». Seuls localhost et 127.0.0.1 sont autorisés.`,
    );
  }
  if (database !== REQUIRED_DB) {
    throw new Error(
      `Refus : la base s'appelle « ${database} ». Seule « ${REQUIRED_DB} » peut être réinitialisée.`,
    );
  }
  return { url, database };
}

async function runSqlFile(client, file) {
  const sql = await readFile(file, "utf8");
  await client.query(sql);
}

async function main() {
  const rawUrl = process.env.DATABASE_URL ?? DEFAULT_URL;
  const { url, database } = assertSafeDatabaseUrl(rawUrl);

  const maintenanceUrl = new URL(url);
  maintenanceUrl.pathname = "/postgres";
  const maintenance = new pg.Client({ connectionString: maintenanceUrl.toString() });
  await maintenance.connect();
  try {
    await maintenance.query(`drop database if exists ${database} with (force)`);
    await maintenance.query(`create database ${database}`);
  } finally {
    await maintenance.end();
  }

  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  try {
    console.log("bootstrap  supabase/tests/bootstrap.sql");
    await runSqlFile(client, path.join(ROOT, "supabase/tests/bootstrap.sql"));

    const migrationsDir = path.join(ROOT, "supabase/migrations");
    const migrations = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();
    for (const migration of migrations) {
      console.log(`migration  ${migration}`);
      await runSqlFile(client, path.join(migrationsDir, migration));
    }

    if (process.env.DB_RESET_SKIP_SEED !== "1") {
      console.log("seed       supabase/seed.sql");
      await runSqlFile(client, path.join(ROOT, "supabase/seed.sql"));
    }
  } finally {
    await client.end();
  }
  console.log(`\n${database} réinitialisée (${url.hostname}).`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
