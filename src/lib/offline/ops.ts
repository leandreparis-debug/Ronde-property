import { z } from "zod";

import { NOTE_MAX_LENGTH } from "@/lib/notes/format";
import { reserveFormSchema } from "@/lib/reserves/schema";
import { RESERVE_STATUSES } from "@/server/domain/enums";
import { MARKER_LABEL_MAX_LENGTH, NOTE_LABEL_MAX_LENGTH } from "@/server/domain/plans";
import { participantInputSchema, visitUpdateSchema } from "@/server/domain/schemas";
import { ZONE_LABEL_MAX_LENGTH } from "@/server/domain/templates";
import { photoPatchSchema, preparePhotoItemSchema } from "@/server/photos/schemas";

/*
 * Catalogue of the synchronisation operations, shared by the device (outbox, optimistic
 * application) and the server (`POST /api/sync`). The payload schemas are the ones of the
 * server actions: no business rule is duplicated here, only the envelope of an operation.
 *
 * Adding an entity (step 13, 14): add its kinds here, apply them locally in
 * `src/lib/offline/local-apply.ts`, on the server in `src/server/sync/apply.ts`, and describe
 * them in `src/lib/offline/labels.ts` (see docs/offline.md, « Brancher une nouvelle entité »).
 */

const uuid = z.uuid();
const coordinate = z.number().min(0).max(1);

/** Operations and their payloads. `baseVersion` lives on the envelope (see below). */
export const syncPayloadSchemas = {
  "visit.update": z.object({ patch: visitUpdateSchema }),
  "participant.add": z.object({ id: uuid, participant: participantInputSchema }),
  "participant.update": z.object({ id: uuid, patch: z.object({ isPresent: z.boolean() }) }),
  "participant.remove": z.object({ id: uuid }),
  "participant.reorder": z.object({ orderedIds: z.array(uuid).max(200) }),

  "note.update": z.object({ noteId: uuid, content: z.string().max(NOTE_MAX_LENGTH) }),
  "zone.add": z.object({ id: uuid, label: z.string().trim().min(1).max(ZONE_LABEL_MAX_LENGTH) }),
  "zone.addTemplate": z.object({ id: uuid, zoneKey: z.string().min(1).max(64) }),
  "zone.insertTemplate": z.object({ templateKey: z.enum(["technical", "meeting"]) }),
  "zone.rename": z.object({
    noteId: uuid,
    label: z.string().trim().min(1).max(ZONE_LABEL_MAX_LENGTH),
  }),
  "zone.reorder": z.object({ orderedIds: z.array(uuid).max(200) }),
  "zone.remove": z.object({ noteId: uuid }),

  "photo.create": z.object({
    id: uuid,
    item: preparePhotoItemSchema.omit({ id: true }).extend({
      // « À ranger » (step 12 b): optional, absent from the operations queued before it.
      toSort: z.boolean().optional(),
      hintViewId: uuid.nullable().optional(),
    }),
  }),
  "photo.confirm": z.object({ id: uuid }),
  "photo.update": z.object({ id: uuid, patch: photoPatchSchema.omit({ photoId: true }) }),
  "photo.setCover": z.object({ id: uuid }),
  "photo.move": z.object({ id: uuid, direction: z.enum(["before", "after"]) }),
  "photo.delete": z.object({ id: uuid }),

  "marker.create": z
    .object({
      id: uuid,
      planId: uuid,
      page: z.number().int().min(1),
      x: coordinate,
      y: coordinate,
      label: z.string().trim().max(NOTE_LABEL_MAX_LENGTH).nullable().optional(),
      photoId: uuid.nullable().optional(),
      // « note »: a note on the plan (step 12 b), its text in `label`, 500 characters.
      kind: z.enum(["photo", "note"]).optional(),
    })
    .superRefine((value, context) => {
      if (value.kind === "note" && !value.label?.trim()) {
        context.addIssue({ code: "custom", message: "La note est vide." });
      }
      if (value.kind !== "note" && (value.label?.length ?? 0) > MARKER_LABEL_MAX_LENGTH) {
        context.addIssue({
          code: "custom",
          message: `${MARKER_LABEL_MAX_LENGTH} caractères maximum.`,
        });
      }
    }),
  "marker.move": z.object({ id: uuid, x: coordinate, y: coordinate }),
  "marker.update": z.object({
    id: uuid,
    // Up to 500 for a note; the database keeps 200 for a photo marker (the sheet allows 80).
    label: z.string().trim().max(NOTE_LABEL_MAX_LENGTH).nullable().optional(),
    photoId: uuid.nullable().optional(),
  }),
  "marker.delete": z.object({ id: uuid }),

  "reserve.create": z.object({ id: uuid, values: reserveFormSchema }),
  "reserve.update": z.object({ id: uuid, values: reserveFormSchema }),
  "reserve.setStatus": z.object({ id: uuid, status: z.enum(RESERVE_STATUSES) }),
  "reserve.delete": z.object({ id: uuid }),
  "reserve.place": z.object({
    id: uuid,
    markerId: uuid,
    planId: uuid,
    page: z.number().int().min(1),
    x: coordinate,
    y: coordinate,
  }),
  "reserve.unplace": z.object({ id: uuid }),
  "reserve.attachMarker": z.object({ id: uuid, markerId: uuid }),
} as const;

export type SyncKind = keyof typeof syncPayloadSchemas;
export const SYNC_KINDS = Object.keys(syncPayloadSchemas) as SyncKind[];

export type SyncPayload<K extends SyncKind = SyncKind> = z.infer<(typeof syncPayloadSchemas)[K]>;

/** Kinds whose `baseVersion` is checked by the server (optimistic concurrency). */
export const VERSIONED_KINDS: readonly SyncKind[] = [
  "visit.update",
  "participant.add",
  "participant.update",
  "participant.remove",
  "participant.reorder",
  "note.update",
  "zone.add",
  "zone.addTemplate",
  "zone.insertTemplate",
  "zone.rename",
  "zone.reorder",
  "zone.remove",
  "reserve.update",
];

/** Envelope of one operation as sent to the server. */
export interface SyncOperation<K extends SyncKind = SyncKind> {
  /** UUID v7 generated on the device; the server replays the stored result of a known id. */
  opId: string;
  visitId: string;
  kind: K;
  /** Version of the entity (visit, note or reserve) the device knew when it wrote. */
  baseVersion?: number;
  payload: SyncPayload<K>;
}

const operationSchemas = SYNC_KINDS.map((kind) =>
  z.object({
    opId: uuid,
    visitId: uuid,
    kind: z.literal(kind),
    baseVersion: z.number().int().min(1).optional(),
    payload: syncPayloadSchemas[kind],
  }),
);

/** Validates one operation envelope (kind-specific payload). */
export const syncOperationSchema = z.union(
  operationSchemas as unknown as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]],
);

/** Operations per request to `POST /api/sync`. */
export const SYNC_BATCH_MAX = 50;

export const syncRequestSchema = z.object({
  ops: z.array(syncOperationSchema).min(1).max(SYNC_BATCH_MAX),
});

/** Why the server refused an operation for good. */
export type SyncRejectionCode =
  "forbidden" | "not_found" | "validation" | "visit_completed" | "visit_deleted";

/**
 * Result of one operation. `applied` carries what the device needs to replace its optimistic
 * state (version, number, fresh entity); `conflict` the current server state; `rejected` a
 * refusal that a retry cannot fix; `retry` a transient failure.
 */
export type SyncResult =
  | { opId: string; status: "applied"; data: Record<string, unknown> }
  | { opId: string; status: "conflict"; message: string; current: Record<string, unknown> }
  | { opId: string; status: "rejected"; code: SyncRejectionCode; message: string }
  | { opId: string; status: "retry"; message: string };

/** Body of a `POST /api/sync` answer. */
export interface SyncResponse {
  results: SyncResult[];
  /** Server time of the answer (ISO 8601): recorded as « dernière synchronisation ». */
  serverTime: string;
}

/** Reasons the sync routes answer 401 with: the device decides what to do with its copy. */
export type SyncAuthFailure = "signed_out" | "revoked" | "inactive";
