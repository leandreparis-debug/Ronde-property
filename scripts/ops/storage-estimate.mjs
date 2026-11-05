#!/usr/bin/env node
/**
 * Estimation du stockage (aucune connexion) :
 *   node scripts/ops/storage-estimate.mjs --rt 12 --visites 6 --sites 80 [--mois 12]
 */
import { parseArgs } from "./lib/target.mjs";
import { estimateStorage } from "./lib/storage-estimate.mjs";

const args = parseArgs(process.argv.slice(2));
const e = estimateStorage({
  rts: Number(args.rt ?? 10),
  visitsPerRtPerMonth: Number(args.visites ?? 6),
  sites: Number(args.sites ?? 80),
  months: Number(args.mois ?? 12),
});
console.log(`${e.visitsPerMonth} visites par mois`);
console.log(`Photos   : ${e.photosGbPerMonth} Go / mois`);
console.log(`Rapports : ${e.reportsGbPerMonth} Go / mois`);
console.log(`Plans    : ${e.plansGb} Go (une fois)`);
console.log(`Total sur ${e.months} mois : ${e.totalGb} Go`);
