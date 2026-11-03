"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { UnexpectedError, userMessage } from "@/server/errors";
import {
  movePhotoSchema,
  photoIdSchema,
  photoIdsSchema,
  photoPatchSchema,
  preparePhotoUploadSchema,
} from "@/server/photos/schemas";
import type { ConfirmPhotoResult, PhotoView, PreparedPhotoUpload } from "@/server/photos/types";
import {
  confirmPhotoUpload,
  deletePhoto,
  discardPendingPhoto,
  movePhoto,
  preparePhotoUpload,
  renewPhotoUpload,
  renewPhotoUrls,
  setCoverPhoto,
  updatePhoto,
} from "@/server/services/photos";

export type PreparePhotoUploadResult =
  { ok: true; uploads: PreparedPhotoUpload[] } | { ok: false; error: string };

/** Creates the pending rows and returns two signed upload URLs per photo. */
export async function preparePhotoUploadAction(input: unknown): Promise<PreparePhotoUploadResult> {
  const parsed = preparePhotoUploadSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Demande invalide." };
  try {
    const uploads = await preparePhotoUpload(parsed.data.visitId, parsed.data.items);
    return { ok: true, uploads };
  } catch (error) {
    return { ok: false, error: userMessage(error) };
  }
}

export type RenewPhotoUploadResult =
  { ok: true; upload: PreparedPhotoUpload } | { ok: false; error: string };

/** New upload URLs for a pending photo whose URLs expired. */
export async function renewPhotoUploadAction(input: unknown): Promise<RenewPhotoUploadResult> {
  const parsed = photoIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Demande invalide." };
  try {
    return { ok: true, upload: await renewPhotoUpload(parsed.data.photoId) };
  } catch (error) {
    return { ok: false, error: userMessage(error) };
  }
}

/** Checks the uploaded objects and marks the photo ready. */
export async function confirmPhotoUploadAction(input: unknown): Promise<ConfirmPhotoResult> {
  const parsed = photoIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Demande invalide.", retryable: false };
  try {
    const result = await confirmPhotoUpload(parsed.data.photoId);
    if (result.ok) revalidatePath(`/visites/${result.photo.visitId}`);
    return result;
  } catch (error) {
    return { ok: false, error: userMessage(error), retryable: error instanceof UnexpectedError };
  }
}

export type PhotoActionResult = { ok: true; photo: PhotoView } | { ok: false; error: string };

export type PhotosActionResult = { ok: true; photos: PhotoView[] } | { ok: false; error: string };

/** Caption, category or zone of a photo. */
export async function updatePhotoAction(input: unknown): Promise<PhotoActionResult> {
  const parsed = photoPatchSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Demande invalide." };
  try {
    const { photoId, ...patch } = parsed.data;
    const photo = await updatePhoto(photoId, patch);
    revalidatePath(`/visites/${photo.visitId}`);
    return { ok: true, photo };
  } catch (error) {
    return { ok: false, error: userMessage(error) };
  }
}

/** Makes the photo the single cover of its visit; returns the refreshed list. */
export async function setCoverPhotoAction(input: unknown): Promise<PhotosActionResult> {
  const parsed = photoIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Demande invalide." };
  try {
    const photos = await setCoverPhoto(parsed.data.photoId);
    if (photos[0]) revalidatePath(`/visites/${photos[0].visitId}`);
    return { ok: true, photos };
  } catch (error) {
    return { ok: false, error: userMessage(error) };
  }
}

/** Moves the photo before or after its neighbour; returns the refreshed list. */
export async function movePhotoAction(input: unknown): Promise<PhotosActionResult> {
  const parsed = movePhotoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Demande invalide." };
  try {
    const photos = await movePhoto(parsed.data.photoId, parsed.data.direction);
    if (photos[0]) revalidatePath(`/visites/${photos[0].visitId}`);
    return { ok: true, photos };
  } catch (error) {
    return { ok: false, error: userMessage(error) };
  }
}

export type DeletePhotoResult = { ok: true } | { ok: false; error: string };

/** Deletes a photo (row under RLS, then objects). */
export async function deletePhotoAction(input: unknown): Promise<DeletePhotoResult> {
  const parsed = photoIdSchema.extend({ visitId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Demande invalide." };
  try {
    await deletePhoto(parsed.data.photoId);
    revalidatePath(`/visites/${parsed.data.visitId}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: userMessage(error) };
  }
}

/** Removes a pending photo whose upload the user cancelled. Never fails loudly. */
export async function discardPendingPhotoAction(input: unknown): Promise<DeletePhotoResult> {
  const parsed = photoIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Demande invalide." };
  try {
    await discardPendingPhoto(parsed.data.photoId);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: userMessage(error) };
  }
}

/** Fresh signed URLs for photos whose URLs expired in the viewer. */
export async function renewPhotoUrlsAction(input: unknown): Promise<PhotosActionResult> {
  const parsed = photoIdsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Demande invalide." };
  try {
    return { ok: true, photos: await renewPhotoUrls(parsed.data.photoIds) };
  } catch (error) {
    return { ok: false, error: userMessage(error) };
  }
}
