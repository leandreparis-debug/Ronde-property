import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import type { UserRole } from "@/server/domain/enums";

/** Guides served on /aide, read from docs/ (bundled by `outputFileTracingIncludes`). */
export const GUIDES = {
  rt: {
    file: "guide-rt.md",
    title: "Guide des RT",
    description: "Installer RONDE, mener une visite, générer le rapport, que faire si…",
    roles: ["rt", "direction", "admin"],
  },
  admin: {
    file: "guide-admin.md",
    title: "Guide de l'administrateur",
    description: "Comptes, import des sites VIGIE, avis du pilote, journal d'audit.",
    roles: ["admin"],
  },
} as const satisfies Record<
  string,
  { file: string; title: string; description: string; roles: readonly UserRole[] }
>;

export type GuideKey = keyof typeof GUIDES;

/** Guides a role may read. */
export function guidesFor(role: UserRole): GuideKey[] {
  return (Object.keys(GUIDES) as GuideKey[]).filter((key) =>
    (GUIDES[key].roles as readonly UserRole[]).includes(role),
  );
}

/** Markdown source of a guide. */
export async function readGuide(key: GuideKey): Promise<string> {
  return readFile(path.join(process.cwd(), "docs", GUIDES[key].file), "utf8");
}

/**
 * Served URL of an image of the guides: the Markdown points to `../public/aide-images/…` so that
 * it also displays on GitHub; the application serves the same file at `/aide-images/…`.
 */
export function resolveGuideImage(src: string): string {
  return src.replace(/^(\.\.\/)?public\//, "/");
}
