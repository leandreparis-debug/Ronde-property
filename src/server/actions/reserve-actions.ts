"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { RESERVE_PHOTOS_MAX, reserveFormSchema, toReserveWrite } from "@/lib/reserves/schema";
import { RESERVE_STATUSES } from "@/server/domain/enums";
import { userMessage } from "@/server/errors";
import type {
  ReserveDetail,
  ReserveHistoryEntry,
  ReserveMarkerRef,
  ResponsibleSuggestions,
} from "@/server/reserves/types";
import {
  createReserve,
  deleteReserve,
  getReserve,
  getReserveHistory,
  getResponsibleSuggestions,
  linkReservePhotos,
  placeReserveOnPlan,
  removeReserveFromPlan,
  setReserveStatus,
  unlinkReservePhoto,
  updateReserve,
} from "@/server/services/reserves";

type Fail = { ok: false; error: string; fields?: Record<string, string> };

function fail(error: unknown): Fail {
  return { ok: false, error: userMessage(error) };
}

function invalid(error: z.ZodError): Fail {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (key && !fields[key]) fields[key] = issue.message;
  }
  return {
    ok: false,
    error: error.issues[0]?.message ?? "Les données saisies sont invalides.",
    fields,
  };
}

/** Pages showing reserves: the visit (tab, detail) and the site pages. */
function revalidateReserves(visitId: string) {
  revalidatePath(`/visites/${visitId}`, "layout");
  revalidatePath("/sites/[code]", "page");
}

const reserveIdSchema = z.object({ reserveId: z.uuid() });

const createSchema = z.object({ visitId: z.uuid(), values: reserveFormSchema });
const updateSchema = z.object({
  reserveId: z.uuid(),
  version: z.number().int().min(1),
  values: reserveFormSchema,
});
const statusSchema = reserveIdSchema.extend({ status: z.enum(RESERVE_STATUSES) });
const photosSchema = reserveIdSchema.extend({
  photoIds: z.array(z.uuid()).min(1).max(RESERVE_PHOTOS_MAX),
});
const unlinkSchema = reserveIdSchema.extend({ photoId: z.uuid() });
const placeSchema = reserveIdSchema.extend({
  planId: z.uuid(),
  page: z.number().int().min(1),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});

export type ReserveResult = { ok: true; reserve: ReserveDetail } | Fail;
export type ReserveUpdateResult =
  | { ok: true; reserve: ReserveDetail }
  | { ok: false; conflict: true; current: ReserveDetail; error: string }
  | Fail;
export type SimpleResult = { ok: true } | Fail;

/** Creates a reserve in a visit (rt / admin, visit in progress: RLS). */
export async function createReserveAction(input: unknown): Promise<ReserveResult> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  try {
    const { visitId, values } = parsed.data;
    const reserve = await createReserve(visitId, toReserveWrite(values), values.photoIds);
    revalidateReserves(visitId);
    return { ok: true, reserve };
  } catch (error) {
    return fail(error);
  }
}

/** Saves a reserve with the version known by the client (optimistic concurrency). */
export async function updateReserveAction(input: unknown): Promise<ReserveUpdateResult> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  try {
    const { reserveId, version, values } = parsed.data;
    const result = await updateReserve(reserveId, toReserveWrite(values), version, values.photoIds);
    if (!result.ok) {
      return { ok: false, conflict: true, current: result.current, error: result.message };
    }
    revalidateReserves(result.reserve.visitId);
    return { ok: true, reserve: result.reserve };
  } catch (error) {
    return fail(error);
  }
}

/** « Lever » (done), « Rouvrir » (open) or « En cours ». */
export async function setReserveStatusAction(input: unknown): Promise<ReserveResult> {
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Demande invalide." };
  try {
    const reserve = await setReserveStatus(parsed.data.reserveId, parsed.data.status);
    revalidateReserves(reserve.visitId);
    return { ok: true, reserve };
  } catch (error) {
    return fail(error);
  }
}

/** Soft delete through `soft_delete_reserve` (the marker on the plan goes with it). */
export async function deleteReserveAction(input: unknown): Promise<SimpleResult> {
  const parsed = reserveIdSchema.extend({ visitId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Demande invalide." };
  try {
    await deleteReserve(parsed.data.reserveId);
    revalidateReserves(parsed.data.visitId);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

/** Links confirmed photos of the visit to a reserve as defect photos. */
export async function linkReservePhotosAction(input: unknown): Promise<ReserveResult> {
  const parsed = photosSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Demande invalide." };
  try {
    await linkReservePhotos(parsed.data.reserveId, parsed.data.photoIds);
    const reserve = await getReserve(parsed.data.reserveId);
    revalidateReserves(reserve.visitId);
    return { ok: true, reserve };
  } catch (error) {
    return fail(error);
  }
}

export async function unlinkReservePhotoAction(input: unknown): Promise<ReserveResult> {
  const parsed = unlinkSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Demande invalide." };
  try {
    await unlinkReservePhoto(parsed.data.reserveId, parsed.data.photoId);
    const reserve = await getReserve(parsed.data.reserveId);
    revalidateReserves(reserve.visitId);
    return { ok: true, reserve };
  } catch (error) {
    return fail(error);
  }
}

export type PlaceReserveResult = { ok: true; marker: ReserveMarkerRef } | Fail;

/** Places (or moves) the reserve's marker on a plan of its site. */
export async function placeReserveOnPlanAction(input: unknown): Promise<PlaceReserveResult> {
  const parsed = placeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Demande invalide." };
  try {
    const { reserveId, ...placement } = parsed.data;
    const marker = await placeReserveOnPlan(reserveId, placement);
    const reserve = await getReserve(reserveId);
    revalidateReserves(reserve.visitId);
    return { ok: true, marker };
  } catch (error) {
    return fail(error);
  }
}

export async function removeReserveFromPlanAction(input: unknown): Promise<SimpleResult> {
  const parsed = reserveIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Demande invalide." };
  try {
    const reserve = await getReserve(parsed.data.reserveId);
    await removeReserveFromPlan(parsed.data.reserveId);
    revalidateReserves(reserve.visitId);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export type ReserveLoadResult =
  { ok: true; reserve: ReserveDetail; history: ReserveHistoryEntry[] } | Fail;

/** Fresh reserve and history (sheet opened in edit mode, conflict reload). */
export async function loadReserveAction(input: unknown): Promise<ReserveLoadResult> {
  const parsed = reserveIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Demande invalide." };
  try {
    const [reserve, history] = await Promise.all([
      getReserve(parsed.data.reserveId),
      getReserveHistory(parsed.data.reserveId),
    ]);
    return { ok: true, reserve, history };
  } catch (error) {
    return fail(error);
  }
}

export type SuggestionsResult = { ok: true; suggestions: ResponsibleSuggestions } | Fail;

/** Responsible choices (active profiles, external pairs used on the site). */
export async function responsibleSuggestionsAction(input: unknown): Promise<SuggestionsResult> {
  const parsed = z.object({ siteId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Demande invalide." };
  try {
    return { ok: true, suggestions: await getResponsibleSuggestions(parsed.data.siteId) };
  } catch (error) {
    return fail(error);
  }
}
