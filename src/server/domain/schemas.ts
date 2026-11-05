import { z } from "zod";

import {
  PHOTO_KINDS,
  RESERVE_PRIORITIES,
  RESERVE_STATUSES,
  RESPONSIBLE_KINDS,
  USER_ROLES,
  VISIT_REASONS,
  VISIT_STATUSES,
  VISIT_TYPES,
} from "./enums";
import type { VisitReason, VisitType } from "./enums";
import { ZONE_KEY_PATTERN } from "./templates";
import { isReasonAllowed } from "./visits";

/*
 * Domain schemas. They mirror the database constraints (lengths, patterns, ranges) so that
 * invalid input is rejected before reaching Postgres, with French messages.
 */

const uuid = z.uuid({ message: "Identifiant invalide." });
const isoDate = z.iso.date({ message: "Date invalide (AAAA-MM-JJ attendu)." });
const isoDateTime = z.iso.datetime({ offset: true, message: "Horodatage invalide." });
const email = z.email({ message: "Adresse e-mail invalide." });
const zoneKey = z
  .string()
  .regex(
    ZONE_KEY_PATTERN,
    "Clé de zone invalide (minuscules, chiffres, _ et -, 64 caractères max).",
  );

export const userRoleSchema = z.enum(USER_ROLES);
export const visitTypeSchema = z.enum(VISIT_TYPES);
export const visitReasonSchema = z.enum(VISIT_REASONS);
export const visitStatusSchema = z.enum(VISIT_STATUSES);
export const reservePrioritySchema = z.enum(RESERVE_PRIORITIES);
export const reserveStatusSchema = z.enum(RESERVE_STATUSES);
export const responsibleKindSchema = z.enum(RESPONSIBLE_KINDS);
export const photoKindSchema = z.enum(PHOTO_KINDS);

/** Application profile of a Supabase Auth user. */
export const profileSchema = z.object({
  id: uuid,
  email,
  fullName: z.string().trim().min(1, "Le nom est obligatoire.").max(200),
  role: userRoleSchema,
  isActive: z.boolean(),
  mustChangePassword: z.boolean(),
});
export type Profile = z.infer<typeof profileSchema>;

/** Public part of a profile, readable by every active user. */
export const profileSummarySchema = profileSchema.pick({
  id: true,
  fullName: true,
  role: true,
  isActive: true,
});
export type ProfileSummary = z.infer<typeof profileSummarySchema>;

/** Site of the VIGIE repository. */
export const siteSchema = z.object({
  id: uuid,
  warehouseCode: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1, "Le nom du site est obligatoire.").max(200),
  address: z.string().max(500).nullable(),
  postalCode: z.string().max(20).nullable(),
  city: z.string().max(200).nullable(),
  surfaceM2: z.number().nonnegative("La surface ne peut pas être négative.").nullable(),
  category: z.string().max(200).nullable(),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
  isActive: z.boolean(),
  importedAt: isoDateTime.nullable(),
});
export type Site = z.infer<typeof siteSchema>;

/** Type / reason rule: a meeting has the « meeting » reason, a technical visit any other. */
function refineTypeReason(value: { type: VisitType; reason: VisitReason }, ctx: z.RefinementCtx) {
  if (!isReasonAllowed(value.type, value.reason)) {
    ctx.addIssue({
      code: "custom",
      path: ["reason"],
      message:
        value.type === "meeting"
          ? "Une réunion a pour motif « Réunion »."
          : "Ce motif est réservé aux réunions.",
    });
  }
}

const visitFields = {
  siteId: uuid,
  type: visitTypeSchema.default("technical"),
  reason: visitReasonSchema.default("periodic"),
  title: z.string().trim().min(1, "Le titre est obligatoire.").max(200, "200 caractères maximum."),
  visitDate: isoDate,
  subject: z.string().trim().max(2000, "2 000 caractères maximum.").nullable().default(null),
  writerId: uuid.nullable().default(null),
};

/** Input to create a visit. The site must exist and be active (checked by the database). */
export const visitInputSchema = z.object(visitFields).superRefine(refineTypeReason);
export type VisitInput = z.infer<typeof visitInputSchema>;

/** Editable fields of an existing visit (the site is immutable). Always sent together. */
export const visitUpdateSchema = z
  .object({
    type: visitFields.type,
    reason: visitFields.reason,
    title: visitFields.title,
    visitDate: visitFields.visitDate,
    subject: visitFields.subject,
    writerId: visitFields.writerId,
  })
  .superRefine(refineTypeReason);
export type VisitUpdate = z.infer<typeof visitUpdateSchema>;

/** Visit as read from the database. */
export const visitSchema = z.object(visitFields).extend({
  id: uuid,
  status: visitStatusSchema,
  completedAt: isoDateTime.nullable(),
  completedBy: uuid.nullable(),
  duplicatedFromId: uuid.nullable(),
  version: z.number().int().min(1),
  createdBy: uuid,
  deletedAt: isoDateTime.nullable(),
  deletedBy: uuid.nullable(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});
export type Visit = z.infer<typeof visitSchema>;

/** Visit with its site and counters, from the visit_summaries view. */
export const visitSummarySchema = z.object({
  id: uuid,
  siteId: uuid,
  siteCode: z.string(),
  siteName: z.string(),
  siteCity: z.string().nullable(),
  type: visitTypeSchema,
  reason: visitReasonSchema,
  title: z.string(),
  visitDate: isoDate,
  status: visitStatusSchema,
  openReservesCount: z.number().int().nonnegative(),
  overdueReservesCount: z.number().int().nonnegative(),
  doneReservesCount: z.number().int().nonnegative(),
  photosCount: z.number().int().nonnegative(),
  lastReportAt: isoDateTime.nullable(),
  /** Zones of the notes tab (total and with a non-blank content), computed at read time. */
  zonesCount: z.number().int().nonnegative(),
  filledZonesCount: z.number().int().nonnegative(),
});
export type VisitSummary = z.infer<typeof visitSummarySchema>;

/** Participant of a visit, internal (with a profile) or external. */
export const participantInputSchema = z.object({
  profileId: uuid.nullable().default(null),
  fullName: z.string().trim().min(1, "Le nom est obligatoire.").max(200),
  company: z.string().trim().max(200).nullable().default(null),
  jobTitle: z.string().trim().max(200).nullable().default(null),
  email: email.nullable().default(null),
  isPresent: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});
export type ParticipantInput = z.infer<typeof participantInputSchema>;

export const participantSchema = participantInputSchema.extend({
  id: uuid,
  visitId: uuid,
});
export type Participant = z.infer<typeof participantSchema>;

/** Note of a zone of a visit. */
export const zoneNoteInputSchema = z.object({
  zoneKey,
  zoneLabel: z.string().trim().min(1, "Le libellé de zone est obligatoire.").max(120),
  sortOrder: z.number().int().default(0),
  content: z.string().max(20_000, "20 000 caractères maximum.").default(""),
});
export type ZoneNoteInput = z.infer<typeof zoneNoteInputSchema>;

export const zoneNoteSchema = zoneNoteInputSchema.extend({
  id: uuid,
  visitId: uuid,
  updatedBy: uuid.nullable(),
  updatedAt: isoDateTime,
});
export type ZoneNote = z.infer<typeof zoneNoteSchema>;

export const PHOTO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const PLAN_MIME_TYPES = ["application/pdf", "image/png", "image/jpeg"] as const;

/** Photo of a visit, stored in the visit-photos bucket. */
export const photoSchema = z.object({
  id: uuid,
  visitId: uuid,
  storagePath: z.string().min(1),
  originalFilename: z.string().max(255).nullable(),
  mimeType: z.enum(PHOTO_MIME_TYPES, { message: "Format accepté : JPEG, PNG ou WebP." }),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  sizeBytes: z.number().int().positive().nullable(),
  caption: z.string().max(500, "500 caractères maximum.").nullable(),
  category: z.string().max(100).nullable(),
  zoneKey: zoneKey.nullable(),
  takenAt: isoDateTime.nullable(),
  sortOrder: z.number().int(),
  isCover: z.boolean(),
  createdBy: uuid.nullable(),
});
export type Photo = z.infer<typeof photoSchema>;

/** Plan attached to a site (AutoCAD export as PDF or image). */
export const sitePlanSchema = z.object({
  id: uuid,
  siteId: uuid,
  name: z.string().trim().min(1, "Le nom du plan est obligatoire.").max(200),
  storagePath: z.string().min(1),
  mimeType: z.enum(PLAN_MIME_TYPES, { message: "Format accepté : PDF, PNG ou JPEG." }),
  pageCount: z.number().int().min(1),
  isArchived: z.boolean(),
  uploadedBy: uuid.nullable(),
});
export type SitePlan = z.infer<typeof sitePlanSchema>;

/** Marker placed on a plan during a visit, in relative coordinates. */
export const planMarkerInputSchema = z.object({
  planId: uuid,
  page: z.number().int().min(1).default(1),
  x: z.number().min(0, "x doit être entre 0 et 1.").max(1, "x doit être entre 0 et 1."),
  y: z.number().min(0, "y doit être entre 0 et 1.").max(1, "y doit être entre 0 et 1."),
  number: z.number().int().min(1),
  label: z.string().trim().max(200).nullable().default(null),
  photoId: uuid.nullable().default(null),
});
export type PlanMarkerInput = z.infer<typeof planMarkerInputSchema>;

export const planMarkerSchema = planMarkerInputSchema.extend({
  id: uuid,
  visitId: uuid,
  createdBy: uuid.nullable(),
});
export type PlanMarker = z.infer<typeof planMarkerSchema>;
