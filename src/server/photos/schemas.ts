import { z } from "zod";

import {
  MAX_PHOTO_BYTES,
  PHOTO_CAPTION_MAX_LENGTH,
  PHOTO_CATEGORIES,
} from "@/server/domain/photos";
import { ZONE_KEY_PATTERN } from "@/server/domain/templates";

/** Maximum number of photos prepared in one call. */
export const MAX_PREPARE_BATCH = 50;

const zoneKey = z
  .string()
  .regex(ZONE_KEY_PATTERN, "Clé de zone invalide.")
  .nullable()
  .default(null);

export const preparePhotoItemSchema = z.object({
  originalFilename: z.string().max(255).nullable().default(null),
  width: z.number().int().positive("Dimensions invalides."),
  height: z.number().int().positive("Dimensions invalides."),
  sizeBytes: z
    .number()
    .int()
    .positive("Fichier vide.")
    .max(MAX_PHOTO_BYTES, "Image trop lourde après compression (4 Mo maximum)."),
  thumbSizeBytes: z
    .number()
    .int()
    .positive("Miniature vide.")
    .max(MAX_PHOTO_BYTES, "Miniature trop lourde (4 Mo maximum)."),
  takenAt: z.iso
    .datetime({ offset: true, message: "Date de prise de vue invalide." })
    .nullable()
    .default(null),
  zoneKey,
});

export const preparePhotoUploadSchema = z.object({
  visitId: z.uuid(),
  items: z.array(preparePhotoItemSchema).min(1, "Aucune image.").max(MAX_PREPARE_BATCH),
});
export type PreparePhotoUploadInput = z.infer<typeof preparePhotoUploadSchema>;

export const photoIdSchema = z.object({ photoId: z.uuid() });

export const photoPatchSchema = z.object({
  photoId: z.uuid(),
  caption: z
    .string()
    .max(PHOTO_CAPTION_MAX_LENGTH, `${PHOTO_CAPTION_MAX_LENGTH} caractères maximum.`)
    .nullable()
    .optional(),
  category: z.enum(PHOTO_CATEGORIES, { message: "Catégorie inconnue." }).optional(),
  zoneKey: zoneKey.optional(),
});

export const movePhotoSchema = z.object({
  photoId: z.uuid(),
  direction: z.enum(["before", "after"]),
});

export const photoIdsSchema = z.object({ photoIds: z.array(z.uuid()).min(1).max(500) });
