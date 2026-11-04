import { z } from "zod";

import {
  MARKER_LABEL_MAX_LENGTH,
  MAX_PLAN_BYTES,
  MAX_PLAN_PAGES,
  PLAN_NAME_MAX_LENGTH,
} from "@/server/domain/plans";

const planName = z
  .string()
  .trim()
  .min(1, "Le nom du plan est obligatoire.")
  .max(PLAN_NAME_MAX_LENGTH, `${PLAN_NAME_MAX_LENGTH} caractères maximum.`);

export const preparePlanUploadSchema = z.object({
  siteId: z.uuid(),
  name: planName,
  mimeType: z.enum(["application/pdf", "image/png", "image/jpeg"], {
    message: "Format accepté : PDF, PNG ou JPEG.",
  }),
  sizeBytes: z
    .number()
    .int()
    .positive("Fichier vide.")
    .max(MAX_PLAN_BYTES, "Fichier trop lourd (50 Mo maximum)."),
  pageCount: z.number().int().min(1).max(MAX_PLAN_PAGES, `${MAX_PLAN_PAGES} pages maximum.`),
});

export const preparePageSchema = z.object({
  pageNumber: z.number().int().min(1).max(MAX_PLAN_PAGES),
  imageMime: z.enum(["image/png", "image/jpeg"]),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  sizeBytes: z.number().int().positive().max(MAX_PLAN_BYTES),
  thumbSizeBytes: z.number().int().positive().max(MAX_PLAN_BYTES),
});

export const preparePageUploadsSchema = z.object({
  planId: z.uuid(),
  pages: z.array(preparePageSchema).min(1).max(MAX_PLAN_PAGES),
});

export const planIdSchema = z.object({ planId: z.uuid() });

export const renamePlanSchema = z.object({ planId: z.uuid(), name: planName });

const coordinate = z.number().min(0, "Hors du plan.").max(1, "Hors du plan.");

export const createMarkerSchema = z.object({
  visitId: z.uuid(),
  planId: z.uuid(),
  page: z.number().int().min(1),
  x: coordinate,
  y: coordinate,
  label: z.string().trim().max(MARKER_LABEL_MAX_LENGTH).nullable().optional(),
  photoId: z.uuid().nullable().optional(),
});

export const moveMarkerSchema = z.object({ markerId: z.uuid(), x: coordinate, y: coordinate });

export const updateMarkerSchema = z.object({
  markerId: z.uuid(),
  label: z
    .string()
    .trim()
    .max(MARKER_LABEL_MAX_LENGTH, `${MARKER_LABEL_MAX_LENGTH} caractères maximum.`)
    .nullable()
    .optional(),
  photoId: z.uuid().nullable().optional(),
});

export const markerIdSchema = z.object({ markerId: z.uuid() });
