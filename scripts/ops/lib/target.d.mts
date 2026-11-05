/** Types of scripts/ops/lib/target.mjs (used by the tests). */
export interface OpsTarget {
  kind: "local" | "supabase";
  label: string;
  /** Phrase the operator types before any write. */
  confirmation: string;
}
export function parseArgs(argv: string[]): Record<string, string | boolean | string[]> & {
  _: string[];
};
export function projectRefOf(databaseUrl: string): string | null;
export function resolveTarget(
  args: Record<string, unknown>,
  databaseUrl: string | undefined,
): OpsTarget;
export function redact(databaseUrl: string): string;
export function confirmTyped(
  phrase: string,
  streams?: { input?: NodeJS.ReadableStream; output?: { write(chunk: string): boolean } },
): Promise<boolean>;
