/**
 * Generates src/server/db/schema.types.ts (Kysely `DB` interface) from the local test
 * database with kysely-codegen, then formats it. Run `pnpm db:reset` first.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const DEFAULT_URL = "postgres://postgres:postgres@127.0.0.1:5432/ronde_test";
const dbUrl = process.env.DATABASE_URL ?? DEFAULT_URL;
const target = "src/server/db/schema.types.ts";

execFileSync(
  "pnpm",
  [
    "exec",
    "kysely-codegen",
    "--dialect",
    "postgres",
    "--url",
    dbUrl,
    "--out-file",
    target,
    "--include-pattern",
    "public.*",
    "--no-domains",
    "--date-parser",
    "string",
    "--numeric-parser",
    "number",
    // Columns filled by triggers at insert time: optional in Kysely's Insertable types.
    "--overrides",
    JSON.stringify({
      columns: {
        "public.reserves.number": "Generated<number>",
        "public.reserves.site_id": "Generated<string>",
      },
    }),
  ],
  { stdio: "inherit" },
);

const header = `/**
 * Types Kysely générés depuis le schéma Postgres par \`pnpm db:codegen\` (kysely-codegen).
 * NE PAS MODIFIER À LA MAIN : relancer la génération après chaque migration.
 */
`;
writeFileSync(target, header + readFileSync(target, "utf8"));
execFileSync("pnpm", ["exec", "prettier", "--write", target], { stdio: "inherit" });
console.log(`${target} régénéré.`);
