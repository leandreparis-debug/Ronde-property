/**
 * Builds the SQL script that applies a range of migrations to a remote Supabase project from
 * the SQL editor (docs/deploy.md). Pure: no file system access, no connection.
 *
 * The script runs in one transaction:
 *   1. a guard checks that `supabase_migrations.schema_migrations` holds exactly the versions
 *      that precede the range (otherwise: exception, nothing changes);
 *   2. each migration file, verbatim, followed by its line in the history;
 *   3. commit, then a final `select` that lists the history.
 */

const VERSION = /^(\d{14})_(.+)\.sql$/;

/**
 * Parses migration file names (`20261109100000_sync_operations.sql`) into ordered entries.
 * @param {{ file: string, sql: string }[]} files
 */
export function parseMigrations(files) {
  return files
    .map(({ file, sql }) => {
      const match = VERSION.exec(file);
      if (!match) throw new Error(`Nom de migration inattendu : ${file}`);
      return { file, version: match[1], name: match[2], sql };
    })
    .sort((a, b) => a.version.localeCompare(b.version))
    .map((migration, index) => ({ ...migration, number: index + 1 }));
}

/**
 * Resolves a bound of the range: an ordinal (`22`), a full version (`20261110090000`) or the
 * start of a file name.
 */
export function resolveBound(migrations, bound) {
  const text = String(bound).trim();
  const found = /^\d{1,3}$/.test(text)
    ? migrations.find((m) => m.number === Number(text))
    : migrations.find((m) => m.version === text || m.file.startsWith(text));
  if (!found) throw new Error(`Migration introuvable : ${text}`);
  return found;
}

function sqlString(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

/** The SQL script for migrations `from` to `to` (inclusive). */
export function buildProdScript(migrations, from, to, { generatedAt = new Date() } = {}) {
  const first = resolveBound(migrations, from);
  const last = resolveBound(migrations, to);
  if (last.number < first.number) {
    throw new Error("La fin de l'intervalle précède son début.");
  }
  for (const migration of migrations) {
    if (
      /^\s*(begin|commit|rollback)\s*;/im.test(migration.sql) &&
      migration.number >= first.number &&
      migration.number <= last.number
    ) {
      throw new Error(`${migration.file} contient sa propre transaction : script impossible.`);
    }
  }
  const before = migrations.filter((m) => m.number < first.number).map((m) => m.version);
  const range = migrations.filter((m) => m.number >= first.number && m.number <= last.number);
  const expected =
    before.length > 0 ? `array[${before.map(sqlString).join(", ")}]::text[]` : "array[]::text[]";
  const lines = [
    `-- RONDE : migrations ${first.number} à ${last.number} (${first.version} à ${last.version})`,
    `-- Généré le ${generatedAt.toISOString()} par « pnpm db:prod-script ${from} ${to} ».`,
    "-- À coller en entier dans Supabase > SQL Editor, sur le projet visé, puis Run.",
    "-- Une seule transaction : soit tout est appliqué, soit rien ne change.",
    "",
    "begin;",
    "",
    `-- Garde-fou : l'historique doit contenir exactement les ${before.length} migrations précédentes.`,
    "do $guard$ begin",
    "  if coalesce((select array_agg(version::text order by version) from supabase_migrations.schema_migrations), array[]::text[])",
    `     is distinct from ${expected} then`,
    `    raise exception 'Historique des migrations inattendu : arrêt, rien n''est modifié (attendu : ${before.length} migrations, de ${before[0] ?? "aucune"} à ${before.at(-1) ?? "aucune"}).';`,
    "  end if;",
    "end $guard$;",
  ];
  for (const migration of range) {
    lines.push(
      "",
      "-- ======================================================================",
      `-- Migration ${migration.number} : ${migration.file}`,
      "-- ======================================================================",
      migration.sql.trimEnd(),
      "",
      `insert into supabase_migrations.schema_migrations (version, name) values (${sqlString(migration.version)}, ${sqlString(migration.name)});`,
    );
  }
  lines.push(
    "",
    "commit;",
    "",
    `-- Vérification : ${last.number} lignes, la dernière ${last.version}.`,
    "select version, name from supabase_migrations.schema_migrations order by version;",
    "",
  );
  return {
    sql: lines.join("\n"),
    fileName: `prod-migrations-${String(first.number).padStart(2, "0")}-${String(last.number).padStart(2, "0")}.sql`,
    range: range.map((m) => m.file),
  };
}
