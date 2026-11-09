import "server-only";

import type {
  SyncKind,
  SyncOperation,
  SyncPayload,
  SyncRejectionCode,
  SyncResult,
} from "@/lib/offline/ops";
import { toReserveWrite } from "@/lib/reserves/schema";
import type { CurrentUser } from "@/server/auth/types";
import { toZoneNoteView } from "@/server/domain/zone-notes";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthenticatedError,
  ValidationError,
} from "@/server/errors";
import { log } from "@/server/log";
import { createPhotoService } from "@/server/photos/service";
import { createPlanService } from "@/server/plans/service";
import { createParticipantRepository } from "@/server/repositories/participant-repository";
import { createVisitRepository } from "@/server/repositories/visit-repository";
import {
  createZoneNoteRepository,
  ZoneNoteConflictError,
} from "@/server/repositories/zone-note-repository";
import { createReserveService } from "@/server/reserves/service";
import type { StorageService } from "@/server/storage/types";

import { findAppliedResult, recordAppliedResult } from "./idempotency";
import { toVisitView } from "./snapshot";

/** What an operation needs to run: the verified user and the storage backend. */
export interface SyncContext {
  user: CurrentUser;
  storage: StorageService;
}

const VISIT_COMPLETED_MESSAGE =
  "La visite a été terminée entre-temps : cette modification n'a pas été enregistrée. Rouvrez la visite pour la reprendre.";
const VISIT_DELETED_MESSAGE =
  "La visite a été supprimée entre-temps : cette modification n'a pas été enregistrée.";

/** Operations whose result is never stored: their answer (signed URLs) expires in minutes. */
const NOT_STORED: readonly SyncKind[] = ["photo.create"];

function applied(opId: string, data: Record<string, unknown> = {}): SyncResult {
  return { opId, status: "applied", data };
}

function rejected(opId: string, code: SyncRejectionCode, message: string): SyncResult {
  return { opId, status: "rejected", code, message };
}

/**
 * Translates a failure into a result. A refusal on a visit that is no longer in progress is
 * told as such, so that the device can present « la visite a été terminée » rather than a
 * generic « droit refusé ».
 */
async function failure(ctx: SyncContext, op: SyncOperation, error: unknown): Promise<SyncResult> {
  if (error instanceof ZoneNoteConflictError) {
    return {
      opId: op.opId,
      status: "conflict",
      message: error.message,
      current: {
        content: error.current.content,
        version: error.current.version,
        updatedAt: error.current.updatedAt.toISOString(),
        updatedByName: error.current.updatedByName,
      },
    };
  }
  if (error instanceof ConflictError && /Rechargez/.test(error.message)) {
    const visit = await createVisitRepository(ctx.user).getById(op.visitId);
    const participants = await createParticipantRepository(ctx.user).list(op.visitId);
    return {
      opId: op.opId,
      status: "conflict",
      message: error.message,
      current: { visit: visit ? toVisitView(visit) : null, participants },
    };
  }
  if (error instanceof ForbiddenError || error instanceof UnauthenticatedError) {
    const visit = await createVisitRepository(ctx.user).getById(op.visitId);
    if (visit?.deletedAt) return rejected(op.opId, "visit_deleted", VISIT_DELETED_MESSAGE);
    if (visit?.status === "completed")
      return rejected(op.opId, "visit_completed", VISIT_COMPLETED_MESSAGE);
    return rejected(op.opId, "forbidden", error.message);
  }
  if (error instanceof NotFoundError) return rejected(op.opId, "not_found", error.message);
  if (error instanceof ValidationError || error instanceof ConflictError) {
    return rejected(op.opId, "validation", error.message);
  }
  log.error("sync.apply_failed", { kind: op.kind, error });
  return {
    opId: op.opId,
    status: "retry",
    message: "Le serveur n'a pas pu appliquer cette modification. Nouvelle tentative…",
  };
}

function requireVersion(op: SyncOperation): number {
  if (op.baseVersion === undefined) throw new ValidationError("Version manquante.");
  return op.baseVersion;
}

async function run(ctx: SyncContext, op: SyncOperation): Promise<SyncResult> {
  const { user, storage } = ctx;
  const id = op.opId;
  switch (op.kind) {
    case "visit.update": {
      const payload = op.payload as SyncPayload<"visit.update">;
      const result = await createVisitRepository(user).update(
        op.visitId,
        requireVersion(op),
        payload.patch,
      );
      return applied(id, { version: result.version, savedAt: result.updatedAt.toISOString() });
    }
    case "participant.add": {
      const payload = op.payload as SyncPayload<"participant.add">;
      const result = await createParticipantRepository(user).add(
        op.visitId,
        requireVersion(op),
        payload.participant,
        { id: payload.id },
      );
      return applied(id, {
        id: result.id,
        version: result.version,
        savedAt: result.updatedAt.toISOString(),
      });
    }
    case "participant.update": {
      const payload = op.payload as SyncPayload<"participant.update">;
      const result = await createParticipantRepository(user).update(
        op.visitId,
        requireVersion(op),
        payload.id,
        payload.patch,
      );
      return applied(id, { version: result.version, savedAt: result.updatedAt.toISOString() });
    }
    case "participant.remove": {
      const payload = op.payload as SyncPayload<"participant.remove">;
      const result = await createParticipantRepository(user).remove(
        op.visitId,
        requireVersion(op),
        payload.id,
      );
      return applied(id, { version: result.version, savedAt: result.updatedAt.toISOString() });
    }
    case "participant.reorder": {
      const payload = op.payload as SyncPayload<"participant.reorder">;
      const result = await createParticipantRepository(user).reorder(
        op.visitId,
        requireVersion(op),
        payload.orderedIds,
      );
      return applied(id, { version: result.version, savedAt: result.updatedAt.toISOString() });
    }
    case "note.update": {
      const payload = op.payload as SyncPayload<"note.update">;
      const result = await createZoneNoteRepository(user).updateContent(
        payload.noteId,
        requireVersion(op),
        payload.content,
      );
      return applied(id, { version: result.version, savedAt: result.updatedAt.toISOString() });
    }
    case "zone.add":
    case "zone.addTemplate":
    case "zone.insertTemplate":
    case "zone.rename":
    case "zone.reorder":
    case "zone.remove": {
      const repo = createZoneNoteRepository(user);
      const version = requireVersion(op);
      const result =
        op.kind === "zone.add"
          ? await repo.addZone(op.visitId, version, {
              label: (op.payload as SyncPayload<"zone.add">).label,
              id: (op.payload as SyncPayload<"zone.add">).id,
            })
          : op.kind === "zone.addTemplate"
            ? await repo.addTemplateZone(
                op.visitId,
                version,
                (op.payload as SyncPayload<"zone.addTemplate">).zoneKey,
                (op.payload as SyncPayload<"zone.addTemplate">).id,
              )
            : op.kind === "zone.insertTemplate"
              ? await repo.insertTemplate(
                  op.visitId,
                  version,
                  (op.payload as SyncPayload<"zone.insertTemplate">).templateKey,
                )
              : op.kind === "zone.rename"
                ? await repo.rename(
                    (op.payload as SyncPayload<"zone.rename">).noteId,
                    version,
                    (op.payload as SyncPayload<"zone.rename">).label,
                  )
                : op.kind === "zone.reorder"
                  ? await repo.reorder(
                      op.visitId,
                      version,
                      (op.payload as SyncPayload<"zone.reorder">).orderedIds,
                    )
                  : await repo.remove((op.payload as SyncPayload<"zone.remove">).noteId, version);
      return applied(id, {
        version: result.version,
        savedAt: result.updatedAt.toISOString(),
        notes: result.notes.map(toZoneNoteView),
      });
    }
    case "photo.create": {
      const payload = op.payload as SyncPayload<"photo.create">;
      const photos = createPhotoService(user, storage);
      try {
        const [upload] = await photos.prepare(op.visitId, [{ ...payload.item, id: payload.id }]);
        return applied(id, { upload });
      } catch (error) {
        // The row exists already (a `PUT` was cut off): new URLs for the same pending photo, or
        // the photo itself when it was confirmed meanwhile.
        if (!(error instanceof ConflictError)) throw error;
        try {
          return applied(id, { upload: await photos.renewUpload(payload.id) });
        } catch (renewError) {
          if (!(renewError instanceof ValidationError)) throw renewError;
          const [photo] = await photos.renewUrls([payload.id]);
          if (!photo) throw renewError;
          return applied(id, { photo });
        }
      }
    }
    case "photo.confirm": {
      const payload = op.payload as SyncPayload<"photo.confirm">;
      const result = await createPhotoService(user, storage).confirm(payload.id);
      if (result.ok) return applied(id, { photo: result.photo });
      if (result.retryable) return { opId: id, status: "retry", message: result.error };
      return failure(ctx, op, new ForbiddenError(result.error));
    }
    case "photo.update": {
      const payload = op.payload as SyncPayload<"photo.update">;
      const photo = await createPhotoService(user, storage).update(payload.id, payload.patch);
      return applied(id, { photo });
    }
    case "photo.setCover": {
      const payload = op.payload as SyncPayload<"photo.setCover">;
      const list = await createPhotoService(user, storage).setCover(payload.id);
      return applied(id, { photos: list });
    }
    case "photo.move": {
      const payload = op.payload as SyncPayload<"photo.move">;
      const list = await createPhotoService(user, storage).move(payload.id, payload.direction);
      return applied(id, { photos: list });
    }
    case "photo.delete": {
      const payload = op.payload as SyncPayload<"photo.delete">;
      try {
        await createPhotoService(user, storage).remove(payload.id);
      } catch (error) {
        // Already gone (deleted from another device): nothing left to do.
        if (!(error instanceof NotFoundError)) throw error;
      }
      return applied(id);
    }
    case "marker.create": {
      const payload = op.payload as SyncPayload<"marker.create">;
      const plans = createPlanService(user, storage);
      try {
        const marker = await plans.markers.create(op.visitId, payload);
        return applied(id, { marker });
      } catch (error) {
        if (!(error instanceof ConflictError)) throw error;
        const existing = (await plans.markers.listForVisit(op.visitId)).find(
          (m) => m.id === payload.id,
        );
        if (!existing) throw error;
        return applied(id, { marker: existing });
      }
    }
    case "marker.move": {
      const payload = op.payload as SyncPayload<"marker.move">;
      const marker = await createPlanService(user, storage).markers.move(
        payload.id,
        payload.x,
        payload.y,
      );
      return applied(id, { marker });
    }
    case "marker.update": {
      const payload = op.payload as SyncPayload<"marker.update">;
      const marker = await createPlanService(user, storage).markers.update(payload.id, {
        ...(payload.label !== undefined ? { label: payload.label } : {}),
        ...(payload.photoId !== undefined ? { photoId: payload.photoId } : {}),
      });
      return applied(id, { marker });
    }
    case "marker.delete": {
      const payload = op.payload as SyncPayload<"marker.delete">;
      try {
        await createPlanService(user, storage).markers.remove(payload.id);
      } catch (error) {
        if (!(error instanceof NotFoundError)) throw error;
      }
      return applied(id);
    }
    case "reserve.create": {
      const payload = op.payload as SyncPayload<"reserve.create">;
      const reserves = createReserveService(user, storage);
      try {
        const reserve = await reserves.create(
          op.visitId,
          toReserveWrite(payload.values),
          payload.values.photoIds,
          { id: payload.id },
        );
        return applied(id, { reserve });
      } catch (error) {
        if (!(error instanceof ConflictError)) throw error;
        return applied(id, { reserve: await reserves.get(payload.id) });
      }
    }
    case "reserve.update": {
      const payload = op.payload as SyncPayload<"reserve.update">;
      const result = await createReserveService(user, storage).update(
        payload.id,
        toReserveWrite(payload.values),
        requireVersion(op),
        payload.values.photoIds,
      );
      if (result.ok) return applied(id, { reserve: result.reserve });
      return {
        opId: id,
        status: "conflict",
        message: result.message,
        current: { reserve: result.current },
      };
    }
    case "reserve.setStatus": {
      const payload = op.payload as SyncPayload<"reserve.setStatus">;
      const reserve = await createReserveService(user, storage).setStatus(
        payload.id,
        payload.status,
      );
      return applied(id, { reserve });
    }
    case "reserve.delete": {
      const payload = op.payload as SyncPayload<"reserve.delete">;
      try {
        await createReserveService(user, storage).softDelete(payload.id);
      } catch (error) {
        if (!(error instanceof NotFoundError)) throw error;
      }
      return applied(id);
    }
    case "reserve.place": {
      const payload = op.payload as SyncPayload<"reserve.place">;
      const reserves = createReserveService(user, storage);
      const ref = await reserves.placeOnPlan(payload.id, {
        markerId: payload.markerId,
        planId: payload.planId,
        page: payload.page,
        x: payload.x,
        y: payload.y,
      });
      const marker = (await createPlanService(user, storage).markers.listForVisit(op.visitId)).find(
        (m) => m.id === ref.id,
      );
      return applied(id, { marker, reserve: await reserves.get(payload.id) });
    }
    case "reserve.unplace": {
      const payload = op.payload as SyncPayload<"reserve.unplace">;
      const reserves = createReserveService(user, storage);
      await reserves.removeFromPlan(payload.id);
      return applied(id, { reserve: await reserves.get(payload.id) });
    }
    case "reserve.attachMarker": {
      const payload = op.payload as SyncPayload<"reserve.attachMarker">;
      const reserves = createReserveService(user, storage);
      const ref = await reserves.attachMarker(payload.id, payload.markerId);
      const marker = (await createPlanService(user, storage).markers.listForVisit(op.visitId)).find(
        (m) => m.id === ref.id,
      );
      return applied(id, { marker, reserve: await reserves.get(payload.id) });
    }
  }
}

/**
 * Applies one operation of the device as the user, through the same repositories and services
 * as the server actions (RLS in `withUser`, triggers for numbers and history). An operation
 * already applied (same `opId`) answers with its stored result (migration 21). Never throws:
 * every failure becomes a `conflict`, `rejected` or `retry` result.
 */
export async function applySyncOperation(ctx: SyncContext, op: SyncOperation): Promise<SyncResult> {
  const stored = NOT_STORED.includes(op.kind)
    ? null
    : await findAppliedResult(ctx.user.id, op.opId).catch(() => null);
  if (stored) return { ...stored, opId: op.opId };
  let result: SyncResult;
  try {
    result = await run(ctx, op);
  } catch (error) {
    result = await failure(ctx, op, error).catch(() => ({
      opId: op.opId,
      status: "retry" as const,
      message: "Le serveur n'a pas pu appliquer cette modification. Nouvelle tentative…",
    }));
  }
  if (result.status === "applied" && !NOT_STORED.includes(op.kind)) {
    await recordAppliedResult(ctx.user.id, op.opId, result).catch((error: unknown) => {
      log.error("sync.record_failed", { kind: op.kind, error });
    });
  }
  return result;
}

/** Applies a batch in order; an operation never stops the following ones. */
export async function applySyncBatch(
  ctx: SyncContext,
  ops: SyncOperation[],
): Promise<SyncResult[]> {
  const results: SyncResult[] = [];
  for (const op of ops) results.push(await applySyncOperation(ctx, op));
  return results;
}
