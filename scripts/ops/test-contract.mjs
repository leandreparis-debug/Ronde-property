#!/usr/bin/env node
/**
 * `pnpm test:contract` : suites de contrat `AuthService` et `StorageService` en version
 * `supabase`, contre le projet Supabase de TEST uniquement (garde : lib/contract-target.mjs).
 * Les comptes créés sont désactivés puis anonymisés, les fichiers supprimés. Lancé par Léandre,
 * jamais par Claude Code (docs/deploy.md, docs/go-live.md).
 */
import { spawnSync } from "node:child_process";

import { checkContractTarget } from "./lib/contract-target.mjs";

function run(label, args, env) {
  console.log(`\n▶ ${label}`);
  const result = spawnSync("pnpm", ["exec", "vitest", "run", ...args], {
    stdio: "inherit",
    env: { ...process.env, ...env },
    shell: process.platform === "win32",
  });
  return result.status ?? 1;
}

let ref;
try {
  ref = checkContractTarget(process.env);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
console.log(`Projet de test : ${ref}`);

const supabaseEnv = {
  RONDE_CONTRACT_PROVIDER: "supabase",
  AUTH_PROVIDER: "supabase",
  STORAGE_PROVIDER: "supabase",
  NEXT_PUBLIC_SUPABASE_URL: process.env.SUPABASE_TEST_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.SUPABASE_TEST_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_TEST_SERVICE_ROLE_KEY,
};

const auth = run(
  "Contrat AuthService (supabase)",
  ["--config", "vitest.db.config.mts", "tests/integration/auth-contract.test.ts"],
  supabaseEnv,
);
const storage = run(
  "Contrat StorageService (supabase)",
  ["tests/server/storage/contract.test.ts", "-t", "supabase"],
  supabaseEnv,
);
process.exit(auth === 0 && storage === 0 ? 0 : 1);
