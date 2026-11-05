#!/usr/bin/env node
/**
 * Supprime les données de DÉMONSTRATION (seed fictive) avant la mise en production : sites
 * `TEST-…`, comptes `@example.test`, leurs visites et tout ce qui s'y rattache (notes, photos,
 * plans, repères, réserves et leur historique, rapports), les fichiers de stockage et les
 * identités de connexion. Conserve le compte admin de Léandre (--keep-admin).
 *
 * SIMULATION par défaut (aucune écriture) ; --apply écrit après une confirmation saisie.
 * Refuse de s'exécuter :
 *   - si DATABASE_URL n'est pas la cible annoncée (--project-ref ou --local), avant toute lecture ;
 *   - si un compte ou un site inconnu de la seed est présent, sans --keep-unknown ;
 *   - si une donnée réelle dépend d'une donnée de démonstration.
 *
 *   node scripts/ops/purge-demo-data.mjs --project-ref <ref> --keep-admin <e-mail> [--dry-run]
 *   node scripts/ops/purge-demo-data.mjs --project-ref <ref> --keep-admin <e-mail> --apply
 *   node scripts/ops/purge-demo-data.mjs --local --keep-admin admin.david@example.test
 *
 * Pas à pas pour Windows : docs/go-live.md (ligne 6).
 */
import { rm } from "node:fs/promises";
import path from "node:path";

import pg from "pg";

import { DEMO_EMAIL_DOMAIN, deleteDemoRows, planPurge } from "./lib/demo-data.mjs";
import { confirmTyped, parseArgs, redact, resolveTarget } from "./lib/target.mjs";
import { projectRefOfApiUrl } from "./lib/contract-target.mjs";

const BUCKETS = ["visit-photos", "site-plans", "reports"];

function print(plan, admin) {
  console.log(`\nConservé :`);
  console.log(`  - compte admin : ${admin.full_name} <${admin.email}>`);
  console.log(`  - comptes inconnus de la seed : ${plan.unknownProfiles.length}`);
  for (const p of plan.unknownProfiles) console.log(`      ${p.full_name} (${p.role})`);
  console.log(`  - sites inconnus de la seed : ${plan.unknownSites.length}`);
  for (const s of plan.unknownSites.slice(0, 20))
    console.log(`      ${s.warehouse_code} ${s.name}`);
  if (plan.unknownSites.length > 20)
    console.log(`      … et ${plan.unknownSites.length - 20} autres`);
  console.log(`\nÀ supprimer :`);
  for (const [table, count] of Object.entries(plan.counts)) {
    console.log(`  - ${table.padEnd(22)} ${count}`);
  }
  console.log(`  - fichiers de stockage   ${plan.files.length}`);
  console.log(`  - identités de connexion ${plan.accountIds.length}`);
}

async function removeFiles(target, files) {
  if (files.length === 0) return 0;
  if (target.kind === "local") {
    const dir = path.resolve(process.env.LOCAL_STORAGE_DIR ?? ".storage");
    for (const file of files) await rm(path.join(dir, file.bucket, file.path), { force: true });
    return files.length;
  }
  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let removed = 0;
  for (const bucket of BUCKETS) {
    const paths = files.filter((f) => f.bucket === bucket).map((f) => f.path);
    for (let i = 0; i < paths.length; i += 100) {
      const { error } = await client.storage.from(bucket).remove(paths.slice(i, i + 100));
      if (error) console.error(`  fichiers ${bucket} : ${error.message}`);
      else removed += Math.min(100, paths.length - i);
    }
  }
  return removed;
}

async function removeIdentities(target, client, ids) {
  if (ids.length === 0) return 0;
  if (target.kind === "local") {
    const result = await client.query("delete from auth.users where id = any($1::uuid[])", [ids]);
    return result.rowCount;
  }
  const { createClient } = await import("@supabase/supabase-js");
  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let removed = 0;
  for (const id of ids) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) console.error(`  identité ${id.slice(0, 8)} : ${error.message}`);
    else removed += 1;
  }
  return removed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const databaseUrl = process.env.DATABASE_URL;
  // 1. The target, before any reading.
  const target = resolveTarget(args, databaseUrl);
  const apply = args.apply === true;
  if (apply && args["dry-run"]) throw new Error("Choisir --dry-run OU --apply.");
  const keepAdmin =
    typeof args["keep-admin"] === "string" ? args["keep-admin"].toLowerCase() : null;
  if (!keepAdmin) throw new Error("Indiquer le compte admin à conserver : --keep-admin <e-mail>.");
  if (target.kind === "supabase") {
    if (keepAdmin.endsWith(DEMO_EMAIL_DOMAIN)) {
      throw new Error("Le compte conservé ne peut pas être un compte fictif de la seed.");
    }
    if (apply && projectRefOfApiUrl(process.env.SUPABASE_URL ?? "") !== args["project-ref"]) {
      throw new Error(
        "Pour --apply, SUPABASE_URL (et SUPABASE_SERVICE_ROLE_KEY) doivent viser le même projet.",
      );
    }
    if (apply && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Pour --apply, SUPABASE_SERVICE_ROLE_KEY est obligatoire.");
    }
  }

  console.log(`Cible : ${target.label} (${redact(databaseUrl)})`);
  console.log(apply ? "Mode : APPLICATION" : "Mode : SIMULATION (aucune écriture)");

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("begin");
    const { rows: admins } = await client.query(
      "select id, full_name, email, role, is_active from public.profiles where lower(email) = $1",
      [keepAdmin],
    );
    const admin = admins[0];
    if (!admin || admin.role !== "admin" || !admin.is_active) {
      throw new Error(`Le compte à conserver doit être un admin actif (${keepAdmin}).`);
    }
    const plan = await planPurge(client, { keepAdminId: admin.id });
    print(plan, admin);

    const unknown = plan.unknownProfiles.length + plan.unknownSites.length;
    if (unknown > 0 && !args["keep-unknown"]) {
      throw new Error(
        `${unknown} compte(s) ou site(s) inconnu(s) de la seed : vérifier la liste ci-dessus, puis relancer avec --keep-unknown pour les conserver.`,
      );
    }
    if (plan.blocking.length > 0) {
      throw new Error(
        `Des données réelles dépendent de données de démonstration : ${plan.blocking.join(", ")}.`,
      );
    }
    if (!apply) {
      await client.query("rollback");
      console.log("\nSIMULATION : rien n'a été modifié. Relancer avec --apply pour supprimer.");
      return;
    }
    if (!(await confirmTyped(target.confirmation))) {
      await client.query("rollback");
      console.log("Confirmation incorrecte : rien n'a été modifié.");
      process.exitCode = 2;
      return;
    }
    const deleted = await deleteDemoRows(client);
    await client.query(
      "select private.audit('system.demo_purged', 'system', null, $1::jsonb, $2::uuid)",
      [
        JSON.stringify({ ...deleted, files: plan.files.length, accounts: plan.accountIds.length }),
        admin.id,
      ],
    );
    await client.query("commit");
    console.log("\nBase : suppression validée (aucune référence orpheline).");
    const files = await removeFiles(target, plan.files);
    console.log(`Fichiers supprimés : ${files} sur ${plan.files.length}.`);
    const identities = await removeIdentities(target, client, plan.accountIds);
    console.log(`Identités de connexion supprimées : ${identities} sur ${plan.accountIds.length}.`);
    console.log("Trace : audit « system.demo_purged ».");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`Arrêt : ${error.message}`);
  process.exitCode = 1;
});
