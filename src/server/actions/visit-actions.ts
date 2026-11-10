"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  participantInputSchema,
  visitInputSchema,
  visitUpdateSchema,
} from "@/server/domain/schemas";
import { ConflictError, userMessage } from "@/server/errors";
import {
  addParticipant,
  completeVisit,
  createVisit,
  deleteVisit,
  duplicateVisit,
  removeParticipant,
  reopenVisit,
  reorderParticipants,
  updateParticipant,
  updateVisit,
} from "@/server/services/visits";

import type { ActionState } from "./state";

function fieldErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

/** Creates a visit from the form and redirects to it. */
export async function createVisitAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = visitInputSchema.safeParse({
    siteId: formData.get("siteId") || undefined,
    type: formData.get("type") || undefined,
    reason: formData.get("reason") || undefined,
    title: formData.get("title") ?? "",
    visitDate: formData.get("visitDate") ?? "",
    subject: null,
    writerId: formData.get("writerId") || null,
  });
  if (!parsed.success) {
    return { ok: false, error: "Vérifiez les champs signalés.", fields: fieldErrors(parsed.error) };
  }
  let created: { id: string };
  try {
    created = await createVisit(parsed.data);
  } catch (error) {
    const message = userMessage(error);
    const fields = /site/i.test(message) ? { siteId: message } : undefined;
    return { ok: false, error: message, fields };
  }
  // A new visit opens on « Liste › Informations »: participants and subject first, then the plan.
  redirect(`/visites/${created.id}?onglet=information&flash=visit_created`);
}

/** Result of an autosave or a participant write. */
export interface VisitWriteResult {
  ok: boolean;
  version?: number;
  savedAt?: string;
  error?: string;
  fields?: Record<string, string>;
  /** The visit changed meanwhile: reload. */
  conflict?: boolean;
  /** Id of the created participant. */
  id?: string;
}

function writeFailure(error: unknown): VisitWriteResult {
  return {
    ok: false,
    error: userMessage(error),
    conflict: error instanceof ConflictError && /Rechargez/.test(error.message),
  };
}

/** Saves the information fields of a visit (autosave). */
export async function saveVisitAction(input: {
  id: string;
  version: number;
  patch: unknown;
}): Promise<VisitWriteResult> {
  const parsed = visitUpdateSchema.safeParse(input.patch);
  if (!parsed.success)
    return { ok: false, error: "Vérifiez les champs signalés.", fields: fieldErrors(parsed.error) };
  try {
    const result = await updateVisit(input.id, input.version, parsed.data);
    revalidatePath(`/visites/${input.id}`);
    return { ok: true, version: result.version, savedAt: result.updatedAt.toISOString() };
  } catch (error) {
    return writeFailure(error);
  }
}

export async function addParticipantAction(input: {
  visitId: string;
  version: number;
  participant: unknown;
}): Promise<VisitWriteResult> {
  const parsed = participantInputSchema.safeParse(input.participant);
  if (!parsed.success)
    return { ok: false, error: "Vérifiez les champs signalés.", fields: fieldErrors(parsed.error) };
  try {
    const result = await addParticipant(input.visitId, input.version, parsed.data);
    revalidatePath(`/visites/${input.visitId}`);
    return {
      ok: true,
      id: result.id,
      version: result.version,
      savedAt: result.updatedAt.toISOString(),
    };
  } catch (error) {
    return writeFailure(error);
  }
}

export async function updateParticipantAction(input: {
  visitId: string;
  version: number;
  id: string;
  patch: { isPresent?: boolean };
}): Promise<VisitWriteResult> {
  try {
    const result = await updateParticipant(input.visitId, input.version, input.id, input.patch);
    revalidatePath(`/visites/${input.visitId}`);
    return { ok: true, version: result.version, savedAt: result.updatedAt.toISOString() };
  } catch (error) {
    return writeFailure(error);
  }
}

export async function removeParticipantAction(input: {
  visitId: string;
  version: number;
  id: string;
}): Promise<VisitWriteResult> {
  try {
    const result = await removeParticipant(input.visitId, input.version, input.id);
    revalidatePath(`/visites/${input.visitId}`);
    return { ok: true, version: result.version, savedAt: result.updatedAt.toISOString() };
  } catch (error) {
    return writeFailure(error);
  }
}

export async function reorderParticipantsAction(input: {
  visitId: string;
  version: number;
  orderedIds: string[];
}): Promise<VisitWriteResult> {
  try {
    const result = await reorderParticipants(input.visitId, input.version, input.orderedIds);
    revalidatePath(`/visites/${input.visitId}`);
    return { ok: true, version: result.version, savedAt: result.updatedAt.toISOString() };
  } catch (error) {
    return writeFailure(error);
  }
}

/** Duplicates the visit and redirects to the copy. */
export async function duplicateVisitAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return { ok: false, error: "Visite introuvable." };
  let created: { id: string };
  try {
    created = await duplicateVisit(id.data);
  } catch (error) {
    return { ok: false, error: userMessage(error) };
  }
  redirect(`/visites/${created.id}?onglet=information&flash=visit_duplicated`);
}

export async function completeVisitAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return { ok: false, error: "Visite introuvable." };
  try {
    await completeVisit(id.data);
  } catch (error) {
    return { ok: false, error: userMessage(error) };
  }
  revalidatePath(`/visites/${id.data}`);
  return { ok: true, tick: Date.now() };
}

export async function reopenVisitAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return { ok: false, error: "Visite introuvable." };
  try {
    await reopenVisit(id.data);
  } catch (error) {
    return { ok: false, error: userMessage(error) };
  }
  revalidatePath(`/visites/${id.data}`);
  return { ok: true, tick: Date.now() };
}

/** Soft-deletes the visit and goes back to the list. */
export async function deleteVisitAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return { ok: false, error: "Visite introuvable." };
  try {
    await deleteVisit(id.data);
  } catch (error) {
    return { ok: false, error: userMessage(error) };
  }
  redirect("/?flash=visit_deleted");
}
