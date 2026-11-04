"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { UnexpectedError, userMessage } from "@/server/errors";
import {
  createMarkerSchema,
  markerIdSchema,
  moveMarkerSchema,
  planIdSchema,
  preparePageUploadsSchema,
  preparePlanUploadSchema,
  renamePlanSchema,
  updateMarkerSchema,
} from "@/server/plans/schemas";
import type {
  ConfirmPlanResult,
  MarkerView,
  PlanDetailView,
  PlanView,
  PreparedPageUpload,
  PreparedPlanUpload,
} from "@/server/plans/types";
import {
  confirmPlanUpload,
  createMarker,
  discardPlanUpload,
  getPlanDetail,
  moveMarker,
  preparePageUploads,
  preparePlanUpload,
  removeMarker,
  renamePlan,
  renewPlanUploads,
  setPlanArchived,
  updateMarker,
} from "@/server/services/plans";

type Fail = { ok: false; error: string };

function fail(error: unknown): Fail {
  return { ok: false, error: userMessage(error) };
}

export type PreparePlanUploadResult = { ok: true; upload: PreparedPlanUpload } | Fail;

/** Creates the pending plan row and signs the upload URL of the original file. */
export async function preparePlanUploadAction(input: unknown): Promise<PreparePlanUploadResult> {
  const parsed = preparePlanUploadSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Demande invalide." };
  try {
    const { siteId, ...meta } = parsed.data;
    return { ok: true, upload: await preparePlanUpload(siteId, meta) };
  } catch (error) {
    return fail(error);
  }
}

export type PreparePageUploadsResult = { ok: true; pages: PreparedPageUpload[] } | Fail;

/** Creates the page rows of a pending plan and signs their upload URLs. */
export async function preparePageUploadsAction(input: unknown): Promise<PreparePageUploadsResult> {
  const parsed = preparePageUploadsSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Demande invalide." };
  try {
    return { ok: true, pages: await preparePageUploads(parsed.data.planId, parsed.data.pages) };
  } catch (error) {
    return fail(error);
  }
}

export type RenewPlanUploadsResult =
  { ok: true; original: PreparedPlanUpload; pages: PreparedPageUpload[] } | Fail;

/** Fresh upload URLs for a pending plan whose URLs expired. */
export async function renewPlanUploadsAction(input: unknown): Promise<RenewPlanUploadsResult> {
  const parsed = planIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Demande invalide." };
  try {
    const renewed = await renewPlanUploads(parsed.data.planId);
    return { ok: true, original: renewed.original, pages: renewed.pages };
  } catch (error) {
    return fail(error);
  }
}

/** Checks the uploaded objects and marks the plan ready. */
export async function confirmPlanUploadAction(input: unknown): Promise<ConfirmPlanResult> {
  const parsed = planIdSchema.extend({ sitePath: z.string().optional() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Demande invalide.", retryable: false };
  try {
    const result = await confirmPlanUpload(parsed.data.planId);
    if (result.ok) revalidatePath("/", "layout");
    return result;
  } catch (error) {
    return { ok: false, error: userMessage(error), retryable: error instanceof UnexpectedError };
  }
}

export type SimpleResult = { ok: true } | Fail;

/** Cancels an import: rows and objects removed. */
export async function discardPlanUploadAction(input: unknown): Promise<SimpleResult> {
  const parsed = planIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Demande invalide." };
  try {
    await discardPlanUpload(parsed.data.planId);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export type PlanResult = { ok: true; plan: PlanView } | Fail;

export async function renamePlanAction(input: unknown): Promise<PlanResult> {
  const parsed = renamePlanSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Demande invalide." };
  try {
    const plan = await renamePlan(parsed.data.planId, parsed.data.name);
    revalidatePath("/", "layout");
    return { ok: true, plan };
  } catch (error) {
    return fail(error);
  }
}

export async function setPlanArchivedAction(input: unknown): Promise<PlanResult> {
  const parsed = planIdSchema.extend({ archived: z.boolean() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Demande invalide." };
  try {
    const plan = await setPlanArchived(parsed.data.planId, parsed.data.archived);
    revalidatePath("/", "layout");
    return { ok: true, plan };
  } catch (error) {
    return fail(error);
  }
}

export type PlanDetailResult = { ok: true; plan: PlanDetailView } | Fail;

/** Fresh signed URLs of a plan (expired page image). */
export async function renewPlanUrlsAction(input: unknown): Promise<PlanDetailResult> {
  const parsed = planIdSchema.extend({ visitId: z.uuid().optional() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Demande invalide." };
  try {
    return { ok: true, plan: await getPlanDetail(parsed.data.planId, parsed.data.visitId) };
  } catch (error) {
    return fail(error);
  }
}

export type MarkerResult = { ok: true; marker: MarkerView } | Fail;

export async function createMarkerAction(input: unknown): Promise<MarkerResult> {
  const parsed = createMarkerSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Demande invalide." };
  try {
    const { visitId, ...rest } = parsed.data;
    const marker = await createMarker(visitId, rest);
    revalidatePath(`/visites/${visitId}`);
    return { ok: true, marker };
  } catch (error) {
    return fail(error);
  }
}

export async function moveMarkerAction(input: unknown): Promise<MarkerResult> {
  const parsed = moveMarkerSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Demande invalide." };
  try {
    const marker = await moveMarker(parsed.data.markerId, parsed.data.x, parsed.data.y);
    revalidatePath(`/visites/${marker.visitId}`);
    return { ok: true, marker };
  } catch (error) {
    return fail(error);
  }
}

export async function updateMarkerAction(input: unknown): Promise<MarkerResult> {
  const parsed = updateMarkerSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Demande invalide." };
  try {
    const { markerId, ...patch } = parsed.data;
    const marker = await updateMarker(markerId, patch);
    revalidatePath(`/visites/${marker.visitId}`);
    return { ok: true, marker };
  } catch (error) {
    return fail(error);
  }
}

export async function removeMarkerAction(input: unknown): Promise<SimpleResult> {
  const parsed = markerIdSchema.extend({ visitId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Demande invalide." };
  try {
    await removeMarker(parsed.data.markerId);
    revalidatePath(`/visites/${parsed.data.visitId}`);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}
