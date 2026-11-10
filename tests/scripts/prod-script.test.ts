import { describe, expect, it } from "vitest";

import {
  buildProdScript,
  parseMigrations,
  resolveBound,
} from "../../scripts/db/lib/prod-script.mjs";

const files = [
  { file: "20261102100100_tables.sql", sql: "create table a (id int);" },
  { file: "20261102100000_extensions.sql", sql: "create extension if not exists x;" },
  { file: "20261109100000_sync_operations.sql", sql: "comment on table a is 'l''étape';" },
];

describe("db:prod-script", () => {
  it("orders the migrations by version and numbers them from 1", () => {
    const migrations = parseMigrations(files);
    expect(migrations.map((m) => [m.number, m.version, m.name])).toEqual([
      [1, "20261102100000", "extensions"],
      [2, "20261102100100", "tables"],
      [3, "20261109100000", "sync_operations"],
    ]);
    expect(() => parseMigrations([{ file: "init.sql", sql: "" }])).toThrow(/inattendu/);
  });

  it("resolves a bound by ordinal, version or start of the file name", () => {
    const migrations = parseMigrations(files);
    expect(resolveBound(migrations, 3).file).toBe("20261109100000_sync_operations.sql");
    expect(resolveBound(migrations, "20261102100100").name).toBe("tables");
    expect(resolveBound(migrations, "20261102100000_ext").number).toBe(1);
    expect(() => resolveBound(migrations, 9)).toThrow(/introuvable/);
  });

  it("guards the exact history, keeps each file verbatim and records it, in one transaction", () => {
    const { sql, fileName, range } = buildProdScript(parseMigrations(files), 2, 3, {
      generatedAt: new Date("2026-11-10T09:00:00Z"),
    });
    expect(fileName).toBe("prod-migrations-02-03.sql");
    expect(range).toEqual(["20261102100100_tables.sql", "20261109100000_sync_operations.sql"]);
    expect(sql).toContain("is distinct from array['20261102100000']::text[]");
    expect(sql.indexOf("begin;")).toBeLessThan(sql.indexOf("create table a"));
    expect(sql).toContain("comment on table a is 'l''étape';");
    expect(sql).toContain(
      "insert into supabase_migrations.schema_migrations (version, name) values ('20261109100000', 'sync_operations');",
    );
    expect(sql.indexOf("commit;")).toBeGreaterThan(sql.lastIndexOf("insert into"));
    expect(sql.match(/^begin;$/gm)).toHaveLength(1);
  });

  it("refuses a reversed range and a migration with its own transaction", () => {
    const migrations = parseMigrations(files);
    expect(() => buildProdScript(migrations, 3, 2)).toThrow(/précède/);
    const own = parseMigrations([
      ...files,
      { file: "20261110000000_x.sql", sql: "begin;\nselect 1;\ncommit;" },
    ]);
    expect(() => buildProdScript(own, 4, 4)).toThrow(/propre transaction/);
  });

  it("expects an empty history for the first migration", () => {
    const { sql } = buildProdScript(parseMigrations(files), 1, 1);
    expect(sql).toContain("is distinct from array[]::text[]");
  });
});
