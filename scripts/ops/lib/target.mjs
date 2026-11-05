/**
 * Target guard shared by every script of scripts/ops/ (production or test project).
 *
 * A script refuses to run unless the database it is about to touch is exactly the one named
 * on the command line:
 *   --project-ref <ref>  a Supabase project: DATABASE_URL must point to that project (host
 *                        `db.<ref>.supabase.co`, or the pooler with the user `postgres.<ref>`);
 *   --local              the local test database only (`ronde_test` on localhost).
 * Writing (`--apply`) then requires the operator to type the confirmation phrase.
 */
import { createInterface } from "node:readline/promises";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** Parses `--name value` and `--flag` arguments. */
export function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      args._.push(arg);
      continue;
    }
    const [name, inline] = arg.slice(2).split("=", 2);
    if (inline !== undefined) args[name] = inline;
    else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith("--")) args[name] = argv[++i];
    else args[name] = true;
  }
  return args;
}

/** Supabase project ref found in a connection string, or null. */
export function projectRefOf(databaseUrl) {
  let url;
  try {
    url = new URL(databaseUrl);
  } catch {
    return null;
  }
  const host = /^db\.([a-z0-9]{20})\.supabase\.co$/.exec(url.hostname);
  if (host) return host[1];
  const user = /^postgres\.([a-z0-9]{20})$/.exec(decodeURIComponent(url.username));
  if (user && url.hostname.endsWith(".pooler.supabase.com")) return user[1];
  return null;
}

/**
 * Checks that DATABASE_URL is the target named by the arguments. Returns a description of the
 * target; throws with a French message otherwise.
 */
export function resolveTarget(args, databaseUrl) {
  if (!databaseUrl) throw new Error("DATABASE_URL n'est pas définie.");
  let url;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL n'est pas une URL PostgreSQL valide.");
  }
  if (args.local && args["project-ref"]) {
    throw new Error("Choisir --local OU --project-ref, pas les deux.");
  }
  if (args.local) {
    const database = url.pathname.replace(/^\//, "");
    if (!LOCAL_HOSTS.has(url.hostname) || database !== "ronde_test") {
      throw new Error(
        `--local n'accepte que la base ronde_test sur localhost (cible actuelle : ${url.hostname}/${database}).`,
      );
    }
    return { kind: "local", label: "base locale ronde_test", confirmation: "ronde_test" };
  }
  const expected = args["project-ref"];
  if (typeof expected !== "string" || !/^[a-z0-9]{20}$/.test(expected)) {
    throw new Error(
      "Indiquer la cible : --project-ref <identifiant du projet Supabase, 20 caractères> ou --local.",
    );
  }
  const actual = projectRefOf(databaseUrl);
  if (actual !== expected) {
    throw new Error(
      `Cible refusée : DATABASE_URL pointe vers ${actual ?? url.hostname}, pas vers le projet ${expected}.`,
    );
  }
  return { kind: "supabase", label: `projet Supabase ${expected}`, confirmation: expected };
}

/** Database URL without its password, for display. */
export function redact(databaseUrl) {
  try {
    const url = new URL(databaseUrl);
    if (url.password) url.password = "***";
    return url.toString();
  } catch {
    return "(URL invalide)";
  }
}

/**
 * Asks the operator to type `phrase`; resolves to true only on an exact match. `input` is
 * injectable for tests (a readable stream).
 */
export async function confirmTyped(
  phrase,
  { input = process.stdin, output = process.stdout } = {},
) {
  const rl = createInterface({ input, output, terminal: false });
  try {
    const answer = await rl.question(`Pour confirmer, saisir exactement « ${phrase} » : `);
    return answer.trim() === phrase;
  } finally {
    rl.close();
  }
}
