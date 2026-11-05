#!/usr/bin/env node
/**
 * RGPD : efface l'adresse e-mail des responsables EXTERNES des réserves levées depuis plus de
 * N mois (24 par défaut). Le nom et l'entreprise restent ; l'historique ne contient jamais
 * l'adresse (migration 19).
 *
 * Simulation par défaut (aucune écriture) ; --apply écrit après une confirmation saisie.
 *
 *   node scripts/ops/clear-external-emails.mjs --project-ref <ref> [--months 24] [--apply]
 *   node scripts/ops/clear-external-emails.mjs --local [--months 24] [--apply]
 *
 * DATABASE_URL doit pointer vers la cible annoncée (voir scripts/ops/lib/target.mjs) ; pas à
 * pas pour Windows : docs/rgpd.md.
 */
import pg from "pg";

import { confirmTyped, parseArgs, redact, resolveTarget } from "./lib/target.mjs";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const months = args.months === undefined ? 24 : Number(args.months);
  if (!Number.isInteger(months) || months < 1 || months > 120) {
    throw new Error("--months doit être un nombre entier de mois entre 1 et 120.");
  }
  const databaseUrl = process.env.DATABASE_URL;
  const target = resolveTarget(args, databaseUrl);
  const apply = args.apply === true;

  console.log(`Cible : ${target.label} (${redact(databaseUrl)})`);
  console.log(`Réserves levées depuis plus de ${months} mois, responsable externe avec e-mail.`);

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const count = async (write) => {
      await client.query("begin");
      try {
        await client.query("set local role service_role");
        const { rows } = await client.query(
          "select private.clear_external_responsible_emails($1, $2) as count",
          [months, write],
        );
        await client.query(write ? "commit" : "rollback");
        return Number(rows[0].count);
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    };

    const found = await count(false);
    console.log(`Adresses concernées : ${found}.`);
    if (!apply) {
      console.log("SIMULATION : rien n'a été modifié. Relancer avec --apply pour effacer.");
      return;
    }
    if (found === 0) {
      console.log("Rien à effacer.");
      return;
    }
    if (!(await confirmTyped(target.confirmation))) {
      console.log("Confirmation incorrecte : rien n'a été modifié.");
      process.exitCode = 2;
      return;
    }
    const cleared = await count(true);
    console.log(
      `${cleared} adresse(s) effacée(s). Trace : audit « rgpd.external_emails_cleared ».`,
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`Arrêt : ${error.message}`);
  process.exitCode = 1;
});
