import "server-only";

import { requireRoleForAction, requireUserForAction } from "@/server/auth/session";
import type { ZoneTemplateKey } from "@/server/domain/templates";
import {
  createZoneNoteRepository,
  type ZoneNoteRecord,
  type ZoneStructureResult,
} from "@/server/repositories/zone-note-repository";
import type { VisitVersion } from "@/server/repositories/visit-repository";

const WRITERS = ["rt", "admin"] as const;

/** Notes by zone of a visit, in display order (RLS: readable with the visit). */
export async function listZoneNotes(visitId: string): Promise<ZoneNoteRecord[]> {
  const user = await requireUserForAction();
  return createZoneNoteRepository(user).list(visitId);
}

/** rt / admin: inserts the missing zones of the template. */
export async function insertZoneTemplate(
  visitId: string,
  visitVersion: number,
  templateKey: ZoneTemplateKey,
): Promise<ZoneStructureResult> {
  const user = await requireRoleForAction(WRITERS);
  return createZoneNoteRepository(user).insertTemplate(visitId, visitVersion, templateKey);
}

/** rt / admin: saves the content of a zone (autosave), checked against the note version. */
export async function saveZoneNote(
  noteId: string,
  version: number,
  content: string,
): Promise<VisitVersion> {
  const user = await requireRoleForAction(WRITERS);
  return createZoneNoteRepository(user).updateContent(noteId, version, content);
}

export async function addZone(visitId: string, visitVersion: number, label: string) {
  const user = await requireRoleForAction(WRITERS);
  return createZoneNoteRepository(user).addZone(visitId, visitVersion, { label });
}

export async function addTemplateZone(visitId: string, visitVersion: number, zoneKey: string) {
  const user = await requireRoleForAction(WRITERS);
  return createZoneNoteRepository(user).addTemplateZone(visitId, visitVersion, zoneKey);
}

export async function renameZone(noteId: string, visitVersion: number, label: string) {
  const user = await requireRoleForAction(WRITERS);
  return createZoneNoteRepository(user).rename(noteId, visitVersion, label);
}

export async function reorderZones(visitId: string, visitVersion: number, orderedIds: string[]) {
  const user = await requireRoleForAction(WRITERS);
  return createZoneNoteRepository(user).reorder(visitId, visitVersion, orderedIds);
}

export async function removeZone(noteId: string, visitVersion: number) {
  const user = await requireRoleForAction(WRITERS);
  return createZoneNoteRepository(user).remove(noteId, visitVersion);
}
