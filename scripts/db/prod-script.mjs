/**
 * Writes the SQL script that applies migrations <from> to <to> to a remote Supabase project,
 * to be pasted by Léandre in the SQL editor (docs/deploy.md). Never connects to anything.
 *
 * Usage: pnpm db:prod-script <from> <to>
 *   <from>, <to>: ordinal (22), version (20261110090000) or start of a file name.
 * Output: dist/ops/prod-migrations-<from>-<to>.sql
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildProdScript, parseMigrations } from "./lib/prod-script.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DIR = path.join(ROOT, "supabase", "migrations");
const OUT = path.join(ROOT, "dist", "ops");

const [from, to = from] = process.argv.slice(2);
if (!from) {
  console.error(
    "Usage : pnpm db:prod-script <début> <fin>   (exemple : pnpm db:prod-script 22 22)",
  );
  process.exit(1);
}
const names = (await readdir(DIR)).filter((name) => name.endsWith(".sql"));
const files = await Promise.all(
  names.map(async (file) => ({ file, sql: await readFile(path.join(DIR, file), "utf8") })),
);
const { sql, fileName, range } = buildProdScript(parseMigrations(files), from, to);
await mkdir(OUT, { recursive: true });
const target = path.join(OUT, fileName);
await writeFile(target, sql, "utf8");
console.log(`Script écrit : ${path.relative(ROOT, target)}`);
for (const file of range) console.log(`  - ${file}`);
console.log(
  "\nÀ coller dans Supabase > SQL Editor par Léandre (docs/deploy.md). Rien n'a été exécuté.",
);
