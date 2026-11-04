/**
 * Lists the migrations of the repository in order, with their SHA-256 fingerprint, to compare
 * with `supabase migration list` on a remote project before and after `supabase db push`.
 *
 * Usage: pnpm db:migrations:list
 *
 * Read-only: nothing is executed against any database.
 */
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DIR = path.join(ROOT, "supabase", "migrations");

const files = (await readdir(DIR)).filter((name) => name.endsWith(".sql")).sort();
console.log(`${files.length} migrations dans supabase/migrations/\n`);
console.log(
  "n°  version         nom                                                     sha256 (12)",
);
let index = 0;
for (const file of files) {
  index += 1;
  const [version, ...rest] = file.replace(/\.sql$/, "").split("_");
  const name = rest.join("_");
  const sha = createHash("sha256")
    .update(await readFile(path.join(DIR, file)))
    .digest("hex")
    .slice(0, 12);
  console.log(`${String(index).padStart(2)}  ${version}  ${name.padEnd(55)} ${sha}`);
}
console.log(
  "\nComparez avec « supabase migration list » (colonnes Local / Remote) : une version absente\n" +
    "côté Remote reste à appliquer avec « supabase db push » (voir docs/deploy.md).",
);
