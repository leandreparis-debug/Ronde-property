/**
 * Guard of `pnpm test:contract`: the contract suites write (accounts, files) and may only run
 * against the Supabase TEST project.
 */
import { projectRefOf } from "./target.mjs";

/** Project ref of a Supabase API URL (`https://<ref>.supabase.co`), or null. */
export function projectRefOfApiUrl(apiUrl) {
  try {
    const match = /^([a-z0-9]{20})\.supabase\.co$/.exec(new URL(apiUrl).hostname);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Checks the environment of `pnpm test:contract`; returns the test project ref or throws with
 * a French message. Required: RONDE_CONTRACT_TARGET=test, SUPABASE_TEST_URL,
 * SUPABASE_TEST_ANON_KEY, SUPABASE_TEST_SERVICE_ROLE_KEY and a DATABASE_URL of the same project;
 * refused when that project is SUPABASE_PROD_PROJECT_REF.
 */
export function checkContractTarget(env) {
  if (env.RONDE_CONTRACT_TARGET !== "test") {
    throw new Error(
      "Refus : RONDE_CONTRACT_TARGET=test est obligatoire (la suite de contrat écrit dans le projet visé).",
    );
  }
  const missing = [
    "SUPABASE_TEST_URL",
    "SUPABASE_TEST_ANON_KEY",
    "SUPABASE_TEST_SERVICE_ROLE_KEY",
    "DATABASE_URL",
  ].filter((name) => !env[name]);
  if (missing.length > 0) throw new Error(`Refus : variables manquantes : ${missing.join(", ")}.`);
  const apiRef = projectRefOfApiUrl(env.SUPABASE_TEST_URL);
  if (!apiRef) throw new Error("Refus : SUPABASE_TEST_URL n'est pas l'URL d'un projet Supabase.");
  const databaseRef = projectRefOf(env.DATABASE_URL);
  if (databaseRef !== apiRef) {
    throw new Error(
      `Refus : DATABASE_URL (${databaseRef ?? "autre hôte"}) et SUPABASE_TEST_URL (${apiRef}) ne visent pas le même projet.`,
    );
  }
  if (env.SUPABASE_PROD_PROJECT_REF && env.SUPABASE_PROD_PROJECT_REF === apiRef) {
    throw new Error(`Refus : ${apiRef} est le projet de PRODUCTION (SUPABASE_PROD_PROJECT_REF).`);
  }
  return apiRef;
}
