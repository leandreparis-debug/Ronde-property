"use server";

import { z } from "zod";

import { userMessage } from "@/server/errors";
import { searchSites } from "@/server/services/sites";
import { applySitesImport, simulateSitesImport } from "@/server/services/site-imports";
import type { ImportReport, PlanOptions } from "@/server/sites/import";

import type { ActionState } from "./state";

/** Option of the SitePicker. */
export interface SiteOption {
  id: string;
  warehouseCode: string;
  name: string;
  city: string | null;
}

/** Searches active sites for the SitePicker (10 results). */
export async function searchSitesAction(query: string): Promise<SiteOption[]> {
  const result = await searchSites({ q: query, pageSize: 10 });
  return result.items.map((site) => ({
    id: site.id,
    warehouseCode: site.warehouseCode,
    name: site.name,
    city: site.city,
  }));
}

export interface ImportActionState extends ActionState {
  report?: ImportReport;
}

function readOptions(formData: FormData): PlanOptions {
  return {
    fullReferential: formData.get("fullReferential") === "true",
    emptyClearsValue: formData.get("emptyClearsValue") === "true",
  };
}

async function readFile(
  formData: FormData,
): Promise<{ buffer: Uint8Array; fileName: string } | null> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return null;
  return { buffer: new Uint8Array(await file.arrayBuffer()), fileName: file.name };
}

/** Admin: simulates the import of the uploaded CSV. */
export async function simulateSitesImportAction(
  _prev: ImportActionState,
  formData: FormData,
): Promise<ImportActionState> {
  const file = await readFile(formData);
  if (!file) return { ok: false, error: "Choisissez un fichier CSV à importer." };
  try {
    const report = await simulateSitesImport(file.buffer, file.fileName, readOptions(formData));
    return { ok: true, tick: Date.now(), report };
  } catch (error) {
    return { ok: false, error: userMessage(error) };
  }
}

const expectedSchema = z.object({
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  counts: z.object({
    create: z.number().int(),
    update: z.number().int(),
    unchanged: z.number().int(),
    reactivate: z.number().int(),
    deactivate: z.number().int(),
    reject: z.number().int(),
  }),
});

/** Admin: applies the import, provided it still matches the validated simulation. */
export async function applySitesImportAction(
  _prev: ImportActionState,
  formData: FormData,
): Promise<ImportActionState> {
  const file = await readFile(formData);
  if (!file)
    return { ok: false, error: "Le fichier n'est plus disponible : relancez la simulation." };
  const expected = expectedSchema.safeParse(JSON.parse(String(formData.get("expected") ?? "null")));
  if (!expected.success)
    return { ok: false, error: "Simulation introuvable : relancez la simulation." };
  try {
    const report = await applySitesImport(
      file.buffer,
      file.fileName,
      readOptions(formData),
      expected.data,
      formData.get("confirmMassDeactivation") === "true",
    );
    return { ok: true, tick: Date.now(), report };
  } catch (error) {
    return { ok: false, error: userMessage(error) };
  }
}
