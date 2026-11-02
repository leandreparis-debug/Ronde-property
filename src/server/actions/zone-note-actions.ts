"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { NOTE_MAX_LENGTH } from "@/lib/notes/format";
import { ZONE_LABEL_MAX_LENGTH } from "@/server/domain/templates";
import { ConflictError, UnexpectedError, userMessage } from "@/server/errors";
import { toZoneNoteView, type ZoneNoteView } from "@/server/domain/zone-notes";
import {
  type ZoneStructureResult,
  ZoneNoteConflictError,
} from "@/server/repositories/zone-note-repository";
import {
  addTemplateZone,
  addZone,
  insertZoneTemplate,
  removeZone,
  renameZone,
  reorderZones,
  saveZoneNote,
} from "@/server/services/zone-notes";

/** Result of a content save. */
export type SaveZoneNoteResult =
  | { ok: true; version: number; savedAt: string }
  | {
      ok: false;
      error: string;
      /** The note changed meanwhile: the current state, for the conflict dialog. */
      conflict?: {
        content: string;
        version: number;
        updatedAt: string;
        updatedByName: string | null;
      };
      /** Server-side failure worth retrying (as opposed to a refusal). */
      retryable?: boolean;
    };

const saveInput = z.object({
  noteId: z.uuid(),
  version: z.number().int().min(1),
  content: z.string().max(NOTE_MAX_LENGTH, "20 000 caractères maximum."),
});

/** Autosave of one zone: the version of the note is checked, never the visit one. */
export async function saveZoneNoteAction(input: unknown): Promise<SaveZoneNoteResult> {
  const parsed = saveInput.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Saisie invalide." };
  try {
    const result = await saveZoneNote(parsed.data.noteId, parsed.data.version, parsed.data.content);
    return { ok: true, version: result.version, savedAt: result.updatedAt.toISOString() };
  } catch (error) {
    if (error instanceof ZoneNoteConflictError) {
      return {
        ok: false,
        error: error.message,
        conflict: {
          content: error.current.content,
          version: error.current.version,
          updatedAt: error.current.updatedAt.toISOString(),
          updatedByName: error.current.updatedByName,
        },
      };
    }
    return { ok: false, error: userMessage(error), retryable: error instanceof UnexpectedError };
  }
}

/** Result of a change of the zone structure. */
export type ZoneStructureActionResult =
  | { ok: true; version: number; savedAt: string; notes: ZoneNoteView[]; id?: string }
  | { ok: false; error: string; conflict?: boolean };

function structureSuccess(
  visitId: string,
  result: ZoneStructureResult & { id?: string },
): ZoneStructureActionResult {
  revalidatePath(`/visites/${visitId}`);
  return {
    ok: true,
    version: result.version,
    savedAt: result.updatedAt.toISOString(),
    notes: result.notes.map(toZoneNoteView),
    ...(result.id ? { id: result.id } : {}),
  };
}

function structureFailure(error: unknown): ZoneStructureActionResult {
  return {
    ok: false,
    error: userMessage(error),
    conflict: error instanceof ConflictError && /Rechargez/.test(error.message),
  };
}

const visitRef = z.object({ visitId: z.uuid(), version: z.number().int().min(1) });
const label = z
  .string()
  .trim()
  .min(1, "Le libellé de la zone est obligatoire.")
  .max(ZONE_LABEL_MAX_LENGTH, `${ZONE_LABEL_MAX_LENGTH} caractères maximum.`);

export async function insertZoneTemplateAction(input: unknown): Promise<ZoneStructureActionResult> {
  const parsed = visitRef
    .extend({ templateKey: z.enum(["technical", "meeting"]) })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Demande invalide." };
  try {
    const { visitId, version, templateKey } = parsed.data;
    return structureSuccess(visitId, await insertZoneTemplate(visitId, version, templateKey));
  } catch (error) {
    return structureFailure(error);
  }
}

export async function addZoneAction(input: unknown): Promise<ZoneStructureActionResult> {
  const parsed = visitRef.extend({ label }).safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Demande invalide." };
  try {
    const { visitId, version } = parsed.data;
    return structureSuccess(visitId, await addZone(visitId, version, parsed.data.label));
  } catch (error) {
    return structureFailure(error);
  }
}

export async function addTemplateZoneAction(input: unknown): Promise<ZoneStructureActionResult> {
  const parsed = visitRef.extend({ zoneKey: z.string().min(1).max(64) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Demande invalide." };
  try {
    const { visitId, version, zoneKey } = parsed.data;
    return structureSuccess(visitId, await addTemplateZone(visitId, version, zoneKey));
  } catch (error) {
    return structureFailure(error);
  }
}

export async function renameZoneAction(input: unknown): Promise<ZoneStructureActionResult> {
  const parsed = visitRef.extend({ noteId: z.uuid(), label }).safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Demande invalide." };
  try {
    const { visitId, version, noteId } = parsed.data;
    return structureSuccess(visitId, await renameZone(noteId, version, parsed.data.label));
  } catch (error) {
    return structureFailure(error);
  }
}

export async function reorderZonesAction(input: unknown): Promise<ZoneStructureActionResult> {
  const parsed = visitRef.extend({ orderedIds: z.array(z.uuid()).max(200) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Demande invalide." };
  try {
    const { visitId, version, orderedIds } = parsed.data;
    return structureSuccess(visitId, await reorderZones(visitId, version, orderedIds));
  } catch (error) {
    return structureFailure(error);
  }
}

export async function removeZoneAction(input: unknown): Promise<ZoneStructureActionResult> {
  const parsed = visitRef.extend({ noteId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Demande invalide." };
  try {
    const { visitId, version, noteId } = parsed.data;
    return structureSuccess(visitId, await removeZone(noteId, version));
  } catch (error) {
    return structureFailure(error);
  }
}
