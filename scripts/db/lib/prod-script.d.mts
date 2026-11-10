/** Types of scripts/db/lib/prod-script.mjs (used by the tests). */
export interface Migration {
  file: string;
  version: string;
  name: string;
  sql: string;
  number: number;
}
export function parseMigrations(files: { file: string; sql: string }[]): Migration[];
export function resolveBound(migrations: Migration[], bound: string | number): Migration;
export function buildProdScript(
  migrations: Migration[],
  from: string | number,
  to: string | number,
  options?: { generatedAt?: Date },
): { sql: string; fileName: string; range: string[] };
