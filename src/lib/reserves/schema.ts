import { z } from "zod";

import { RESERVE_PRIORITIES } from "@/server/domain/enums";
import { ZONE_KEY_PATTERN } from "@/server/domain/templates";

/** Maximum length of the action of a reserve (database CHECK). */
export const RESERVE_ACTION_MAX = 500;
/** Maximum length of the description of a reserve (database CHECK). */
export const RESERVE_DESCRIPTION_MAX = 5000;
/** Maximum number of defect photos linked from the sheet in one save. */
export const RESERVE_PHOTOS_MAX = 20;

/** Responsible choice in the sheet: internal profile, external company or « À désigner ». */
export const RESPONSIBLE_MODES = ["internal", "external", "none"] as const;
export type ResponsibleMode = (typeof RESPONSIBLE_MODES)[number];

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Values of the reserve sheet, shared by the browser (react-hook-form) and the server
 * actions. Every optional text is a string where `""` means « none », so that the form keeps
 * controlled inputs; {@link toReserveWrite} turns them into database values.
 */
export const reserveFormSchema = z
  .object({
    action: z
      .string()
      .trim()
      .min(1, "L'action est obligatoire.")
      .max(RESERVE_ACTION_MAX, `${RESERVE_ACTION_MAX} caractères maximum.`),
    description: z.string().trim().max(RESERVE_DESCRIPTION_MAX, "5 000 caractères maximum."),
    zoneKey: z
      .string()
      .refine((value) => value === "" || ZONE_KEY_PATTERN.test(value), "Zone invalide."),
    priority: z.enum(RESERVE_PRIORITIES, { message: "Priorité invalide." }),
    dueDate: z
      .string()
      .refine(
        (value) => value === "" || (isoDatePattern.test(value) && !Number.isNaN(Date.parse(value))),
        "Date invalide.",
      ),
    responsibleMode: z.enum(RESPONSIBLE_MODES, { message: "Responsable invalide." }),
    responsibleProfileId: z.string(),
    responsibleCompany: z.string().trim().max(200, "200 caractères maximum."),
    responsibleName: z.string().trim().max(200, "200 caractères maximum."),
    responsibleEmail: z.string().trim().max(254, "Adresse e-mail trop longue."),
    photoIds: z
      .array(z.string().regex(uuidPattern, "Photo invalide."))
      .max(RESERVE_PHOTOS_MAX, `${RESERVE_PHOTOS_MAX} photos au plus.`),
  })
  .superRefine((value, ctx) => {
    if (value.responsibleMode === "internal" && !uuidPattern.test(value.responsibleProfileId)) {
      ctx.addIssue({
        code: "custom",
        path: ["responsibleProfileId"],
        message: "Choisissez un responsable interne.",
      });
    }
    if (value.responsibleMode === "external") {
      if (!value.responsibleName) {
        ctx.addIssue({
          code: "custom",
          path: ["responsibleName"],
          message: "Le nom du responsable est obligatoire.",
        });
      }
      if (value.responsibleEmail && !z.email().safeParse(value.responsibleEmail).success) {
        ctx.addIssue({
          code: "custom",
          path: ["responsibleEmail"],
          message: "Adresse e-mail invalide.",
        });
      }
    }
  });

/** Values of the reserve sheet (input and output of {@link reserveFormSchema}). */
export type ReserveFormValues = z.infer<typeof reserveFormSchema>;

/** Empty sheet: normal priority, no due date, « À désigner », zone prefilled when known. */
export function emptyReserveForm(zoneKey: string | null = null): ReserveFormValues {
  return {
    action: "",
    description: "",
    zoneKey: zoneKey ?? "",
    priority: "normal",
    dueDate: "",
    responsibleMode: "none",
    responsibleProfileId: "",
    responsibleCompany: "",
    responsibleName: "",
    responsibleEmail: "",
    photoIds: [],
  };
}

/** Columns written for a reserve, after normalisation (`null` for « none »). */
export interface ReserveWrite {
  action: string;
  description: string | null;
  zoneKey: string | null;
  priority: ReserveFormValues["priority"];
  dueDate: string | null;
  responsibleKind: "internal" | "external" | null;
  responsibleProfileId: string | null;
  responsibleName: string | null;
  responsibleCompany: string | null;
  responsibleEmail: string | null;
}

/**
 * Turns validated sheet values into database values. Only the fields of the chosen
 * responsible mode are kept, so that switching mode never leaves stale data behind (the
 * database CHECK `reserves_responsible_consistency` would refuse it).
 */
export function toReserveWrite(values: ReserveFormValues): ReserveWrite {
  const orNull = (value: string) => (value.trim() === "" ? null : value.trim());
  const mode = values.responsibleMode;
  return {
    action: values.action.trim(),
    description: orNull(values.description),
    zoneKey: orNull(values.zoneKey),
    priority: values.priority,
    dueDate: orNull(values.dueDate),
    responsibleKind: mode === "none" ? null : mode,
    responsibleProfileId: mode === "internal" ? values.responsibleProfileId : null,
    responsibleName: mode === "external" ? values.responsibleName.trim() : null,
    responsibleCompany: mode === "external" ? orNull(values.responsibleCompany) : null,
    responsibleEmail: mode === "external" ? orNull(values.responsibleEmail) : null,
  };
}

/** Sheet values of an existing reserve (edit mode). */
export function reserveToForm(reserve: {
  action: string;
  description: string | null;
  zoneKey: string | null;
  priority: ReserveFormValues["priority"];
  dueDate: string | null;
  responsibleKind: "internal" | "external" | null;
  responsibleProfileId: string | null;
  responsibleName: string | null;
  responsibleCompany: string | null;
  responsibleEmail: string | null;
  photoIds: string[];
}): ReserveFormValues {
  return {
    action: reserve.action,
    description: reserve.description ?? "",
    zoneKey: reserve.zoneKey ?? "",
    priority: reserve.priority,
    dueDate: reserve.dueDate ?? "",
    responsibleMode: reserve.responsibleKind ?? "none",
    responsibleProfileId: reserve.responsibleProfileId ?? "",
    responsibleCompany: reserve.responsibleCompany ?? "",
    responsibleName: reserve.responsibleName ?? "",
    responsibleEmail: reserve.responsibleEmail ?? "",
    photoIds: reserve.photoIds,
  };
}
