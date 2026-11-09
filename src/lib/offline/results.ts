import type { PhotoView } from "@/server/photos/types";
import type { MarkerView } from "@/server/plans/types";
import type { ReserveDetail } from "@/server/reserves/types";

import type { ConflictEntry, LocalReserve, OutboxEntry, RondeLocalDb } from "./db";
import { blobKeys } from "./db";
import { uuidv7 } from "./ids";
import type { SyncResult } from "./ops";
import { blockDependents, rebaseScope } from "./outbox";
import type { VisitSnapshot } from "./snapshot";

/** What a waiting screen learns about its operation. */
export type OperationOutcome =
  | { status: "applied"; data: Record<string, unknown> }
  | { status: "conflict"; conflict: ConflictEntry }
  | { status: "rejected"; code: string; message: string }
  | { status: "queued" };

interface ApplyContext {
  /** The visit is kept offline: confirmed photo blobs stay as its local copy. */
  kept: boolean;
  now?: string;
}

/** Writes a ready photo from the server into the store. */
async function putReadyPhoto(db: RondeLocalDb, photo: PhotoView): Promise<void> {
  await db.photos.put({ ...photo, uploadStatus: "ready" });
}

async function putReserve(db: RondeLocalDb, reserve: ReserveDetail): Promise<void> {
  await db.reserves.put(reserve as LocalReserve);
  // Markers drawn for this reserve show its code and status.
  const markers = await db.markers.where("visitId").equals(reserve.visitId).toArray();
  for (const marker of markers) {
    if (marker.reserve?.id === reserve.id) {
      await db.markers.update(marker.id, {
        reserve: {
          id: reserve.id,
          code: reserve.code,
          action: reserve.action,
          status: reserve.status,
          isOverdue: reserve.isOverdue,
        },
      });
    }
  }
}

async function dropPhotoBlobs(db: RondeLocalDb, photoId: string): Promise<void> {
  await db.blobs.bulkDelete([blobKeys.photoMain(photoId), blobKeys.photoThumb(photoId)]);
}

/**
 * Applies an `applied` result: the authoritative state replaces the optimistic one (version,
 * number, fresh entity), the operation leaves the outbox (a photo moves to its next stage) and
 * the later operations of the same version scope are rebased. Returns the outcome for the
 * screens that wait on it.
 */
async function applied(
  db: RondeLocalDb,
  entry: OutboxEntry,
  data: Record<string, unknown>,
  context: ApplyContext,
): Promise<OperationOutcome> {
  const version = typeof data.version === "number" ? data.version : null;
  switch (entry.kind) {
    case "visit.update":
    case "participant.add":
    case "participant.update":
    case "participant.remove":
    case "participant.reorder": {
      if (version !== null) {
        await db.visits.update(entry.visitId, {
          version,
          updatedAt: typeof data.savedAt === "string" ? data.savedAt : undefined,
        });
      }
      break;
    }
    case "note.update": {
      if (version !== null) {
        await db.notes.update(entry.entityId, {
          version,
          updatedAt: typeof data.savedAt === "string" ? data.savedAt : undefined,
        });
      }
      break;
    }
    case "zone.add":
    case "zone.addTemplate":
    case "zone.insertTemplate":
    case "zone.rename":
    case "zone.reorder":
    case "zone.remove": {
      if (version !== null) await db.visits.update(entry.visitId, { version });
      const notes = Array.isArray(data.notes) ? (data.notes as VisitSnapshot["notes"]) : [];
      if (notes.length > 0) {
        const pendingNotes = new Set(
          (await db.outbox.where("visitId").equals(entry.visitId).toArray())
            .filter((e) => e.kind === "note.update" && e.opId !== entry.opId)
            .map((e) => e.entityId),
        );
        const local = await db.notes.where("visitId").equals(entry.visitId).toArray();
        const localById = new Map(local.map((note) => [note.id, note]));
        await db.notes.where("visitId").equals(entry.visitId).delete();
        for (const note of notes) {
          const mine = localById.get(note.id);
          await db.notes.put({
            ...note,
            visitId: entry.visitId,
            ...(mine && pendingNotes.has(note.id)
              ? { content: mine.content, version: mine.version }
              : {}),
          });
        }
      }
      break;
    }
    case "photo.create": {
      if (data.upload && typeof data.upload === "object") {
        const upload = data.upload as NonNullable<OutboxEntry["photo"]>["upload"];
        await db.outbox.update(entry.opId, {
          status: "pending",
          photo: {
            ...(entry.photo ?? { name: "", progress: 0, stage: "create" }),
            stage: "put",
            upload,
          },
          updatedAt: context.now ?? new Date().toISOString(),
        });
        return { status: "applied", data };
      }
      if (data.photo) {
        await putReadyPhoto(db, data.photo as PhotoView);
        if (!context.kept) await dropPhotoBlobs(db, entry.entityId);
      }
      break;
    }
    case "photo.confirm": {
      if (data.photo) {
        await putReadyPhoto(db, data.photo as PhotoView);
        if (!context.kept) await dropPhotoBlobs(db, entry.entityId);
      }
      break;
    }
    case "photo.update": {
      if (data.photo) await putReadyPhoto(db, data.photo as PhotoView);
      break;
    }
    case "photo.setCover":
    case "photo.move": {
      if (Array.isArray(data.photos)) {
        for (const photo of data.photos as PhotoView[]) await putReadyPhoto(db, photo);
      }
      break;
    }
    case "photo.delete":
    case "marker.delete":
    case "reserve.delete":
      break;
    case "marker.create":
    case "marker.move":
    case "marker.update": {
      if (data.marker) await db.markers.put(data.marker as MarkerView);
      break;
    }
    case "reserve.create":
    case "reserve.update":
    case "reserve.setStatus":
    case "reserve.unplace": {
      if (data.reserve) await putReserve(db, data.reserve as ReserveDetail);
      break;
    }
    case "reserve.place":
    case "reserve.attachMarker": {
      if (data.marker) await db.markers.put(data.marker as MarkerView);
      if (data.reserve) await putReserve(db, data.reserve as ReserveDetail);
      break;
    }
  }
  await db.outbox.delete(entry.opId);
  if (entry.versionScope && version !== null) {
    await rebaseScope(db, entry.versionScope, entry.baseVersion, version);
  }
  return { status: "applied", data };
}

/**
 * Applies a `conflict` result: the server state is written back to the store, the local input
 * is set aside in `conflicts`, the operation leaves the outbox and the later operations of the
 * same scope wait for the arbitration.
 */
async function conflicted(
  db: RondeLocalDb,
  entry: OutboxEntry,
  message: string,
  current: Record<string, unknown>,
  context: ApplyContext,
): Promise<OperationOutcome> {
  let serverVersion = 0;
  if (entry.kind === "note.update") {
    serverVersion = Number(current.version ?? 0);
    await db.notes.update(entry.entityId, {
      content: String(current.content ?? ""),
      version: serverVersion,
      updatedAt: typeof current.updatedAt === "string" ? current.updatedAt : undefined,
      updatedByName: typeof current.updatedByName === "string" ? current.updatedByName : null,
      updatedBy: "",
    });
  } else if (entry.kind === "reserve.update") {
    const reserve = current.reserve as ReserveDetail | undefined;
    if (reserve) {
      serverVersion = reserve.version;
      await putReserve(db, reserve);
    }
  } else {
    const visit = current.visit as VisitSnapshot["visit"] | null | undefined;
    if (visit) {
      serverVersion = visit.version;
      const local = await db.visits.get(entry.visitId);
      if (local) {
        await db.visits.put({
          ...local,
          ...visit,
          kept: local.kept,
          keptAt: local.keptAt,
          snapshotAt: local.snapshotAt,
          writers: local.writers,
          reportOptions: local.reportOptions,
          canCreate: local.canCreate,
          userRole: local.userRole,
        });
      }
      const participants = Array.isArray(current.participants)
        ? (current.participants as VisitSnapshot["participants"])
        : null;
      if (participants) {
        await db.participants.where("visitId").equals(entry.visitId).delete();
        await db.participants.bulkPut(participants.map((p) => ({ ...p, visitId: entry.visitId })));
      }
    }
  }
  const conflict: ConflictEntry = {
    id: uuidv7(),
    visitId: entry.visitId,
    kind: entry.kind,
    entityId: entry.entityId,
    versionScope: entry.versionScope ?? `${entry.kind}:${entry.entityId}`,
    label: entry.label,
    mine: entry.payload,
    theirs: current,
    serverVersion,
    message,
    createdAt: context.now ?? new Date().toISOString(),
  };
  await db.conflicts.put(conflict);
  await db.outbox.delete(entry.opId);
  // Later operations on the same scope would conflict too: they wait for the arbitration.
  if (entry.versionScope) {
    const later = await db.outbox
      .filter((e) => e.versionScope === entry.versionScope && e.status === "pending")
      .toArray();
    for (const e of later) {
      await db.outbox.update(e.opId, { status: "blocked", blockedBy: conflict.id });
    }
  }
  return { status: "conflict", conflict };
}

/**
 * Applies one server result to the store. Never throws for a malformed payload: the operation
 * is then kept for a retry.
 */
export async function applySyncResult(
  db: RondeLocalDb,
  entry: OutboxEntry,
  result: SyncResult,
  context: ApplyContext,
): Promise<OperationOutcome> {
  switch (result.status) {
    case "applied":
      return applied(db, entry, result.data, context);
    case "conflict":
      return conflicted(db, entry, result.message, result.current, context);
    case "rejected": {
      await db.outbox.update(entry.opId, {
        status: "rejected",
        rejection: { code: result.code, message: result.message },
        lastError: result.message,
        updatedAt: context.now ?? new Date().toISOString(),
      });
      await blockDependents(db, entry.opId, entry.opId);
      return { status: "rejected", code: result.code, message: result.message };
    }
    case "retry": {
      await db.outbox.update(entry.opId, {
        status: "pending",
        attempts: entry.attempts + 1,
        lastError: result.message,
        updatedAt: context.now ?? new Date().toISOString(),
      });
      return { status: "queued" };
    }
  }
}
