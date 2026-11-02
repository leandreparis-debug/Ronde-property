/**
 * Generates src/server/db/database.types.ts from the local test database with the
 * Supabase CLI (`supabase gen types typescript --db-url …`), then formats it.
 * Run `pnpm db:reset` first so the schema is up to date.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const DEFAULT_URL = "postgres://postgres:postgres@127.0.0.1:5432/ronde_test";
const dbUrl = process.env.DATABASE_URL ?? DEFAULT_URL;
const target = "src/server/db/database.types.ts";

const header = `/**
 * Types générés depuis le schéma Postgres par \`pnpm db:types\`
 * (supabase gen types typescript --db-url … --schema public).
 * NE PAS MODIFIER À LA MAIN : relancer la génération après chaque migration.
 */
`;

const generated = execFileSync(
  "pnpm",
  ["exec", "supabase", "gen", "types", "typescript", "--db-url", dbUrl, "--schema", "public"],
  { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
);

writeFileSync(target, header + generated);
execFileSync("pnpm", ["exec", "prettier", "--write", target], { stdio: "inherit" });
console.log(`${target} régénéré.`);
