"use client";

import { useCallback, useMemo } from "react";

import type { ConflictEntry } from "@/lib/offline/db";
import { describeOperation } from "@/lib/offline/labels";
import { uuidv7 } from "@/lib/offline/ids";
import type { SyncKind, SyncPayload } from "@/lib/offline/ops";
import type { NewOperation } from "@/lib/offline/outbox";
import type { ReserveFormValues } from "@/lib/reserves/schema";
import type { ParticipantInput, VisitUpdate } from "@/server/domain";
import type { ReserveStatus } from "@/server/domain/enums";
import type { PhotoPatch } from "@/server/photos/types";

import { useOffline } from "./offline-provider";

/** Outcome of a write as the screens see it. */
export type MutationResult =
  | {
      ok: true;
      /** The server has not answered yet (offline or retrying): the change waits in the outbox. */
      queued: boolean;
      data: Record<string, unknown>;
      /** Identifier created by the device (new participant, zone, marker, reserve). */
      id?: string;
    }
  | { ok: false; error: string; conflict?: ConflictEntry };

const UNAVAILABLE = "La tablette prépare sa copie locale : réessayez dans un instant.";

/**
 * Writes of a visit, all through the outbox: the change is applied to the local store at once,
 * then sent. Online, the promise waits for the server; a refusal is undone (the store is read
 * again) and returned as an error, a conflict is returned with its entry for the screen to
 * present. Offline, it resolves at once with `queued: true`.
 */
export function useVisitMutations(visitId: string) {
  const { engine, refreshVisit } = useOffline();

  const run = useCallback(
    async <K extends SyncKind>(
      operation: Omit<NewOperation<K>, "visitId" | "label"> & { label?: string },
      context: Parameters<typeof describeOperation>[1] = {},
      id?: string,
    ): Promise<MutationResult> => {
      if (!engine) return { ok: false, error: UNAVAILABLE };
      const enqueued = await engine.enqueue({
        ...operation,
        visitId,
        label: operation.label ?? describeOperation(operation.kind, context),
      } as NewOperation);
      const outcome = await enqueued.wait();
      switch (outcome.status) {
        case "applied":
          return { ok: true, queued: false, data: outcome.data, id };
        case "queued":
          return { ok: true, queued: true, data: {}, id };
        case "conflict":
          return { ok: false, error: outcome.conflict.message, conflict: outcome.conflict };
        case "rejected": {
          // Refused while the user was looking: undo, the server state comes back.
          if (enqueued.outcome.kind === "queued") {
            await engine.remove(enqueued.outcome.entry.opId);
          }
          await refreshVisit(visitId);
          return { ok: false, error: outcome.message };
        }
      }
    },
    [engine, refreshVisit, visitId],
  );

  return useMemo(() => {
    const visitScope = `visit:${visitId}`;
    const op = <K extends SyncKind>(kind: K, entityId: string, payload: SyncPayload<K>) => ({
      kind,
      entityId,
      payload,
    });
    return {
      run,
      saveVisit: (patch: VisitUpdate) =>
        run({ ...op("visit.update", visitId, { patch }), versionScope: visitScope }),
      addParticipant: (participant: ParticipantInput) => {
        const id = uuidv7();
        return run(
          { ...op("participant.add", id, { id, participant }), versionScope: visitScope },
          { participantName: participant.fullName },
          id,
        );
      },
      setParticipantPresence: (id: string, isPresent: boolean, name: string) =>
        run(
          {
            ...op("participant.update", id, { id, patch: { isPresent } }),
            versionScope: visitScope,
          },
          { participantName: name },
        ),
      removeParticipant: (id: string, name: string) =>
        run(
          { ...op("participant.remove", id, { id }), versionScope: visitScope },
          { participantName: name },
        ),
      reorderParticipants: (orderedIds: string[]) =>
        run({
          ...op("participant.reorder", visitId, { orderedIds }),
          versionScope: visitScope,
        }),

      saveNote: (noteId: string, content: string, zoneLabel: string) =>
        run(
          { ...op("note.update", noteId, { noteId, content }), versionScope: `note:${noteId}` },
          { zoneLabel },
        ),
      addZone: (label: string) => {
        const id = uuidv7();
        return run(
          { ...op("zone.add", id, { id, label }), versionScope: visitScope },
          { zoneLabel: label },
          id,
        );
      },
      addTemplateZone: (zoneKey: string, label: string) => {
        const id = uuidv7();
        return run(
          { ...op("zone.addTemplate", id, { id, zoneKey }), versionScope: visitScope },
          { zoneLabel: label },
          id,
        );
      },
      insertTemplate: (templateKey: "technical" | "meeting") =>
        run({
          ...op("zone.insertTemplate", visitId, { templateKey }),
          versionScope: visitScope,
        }),
      renameZone: (noteId: string, label: string) =>
        run(
          { ...op("zone.rename", noteId, { noteId, label }), versionScope: visitScope },
          { zoneLabel: label },
        ),
      reorderZones: (orderedIds: string[]) =>
        run({ ...op("zone.reorder", visitId, { orderedIds }), versionScope: visitScope }),
      removeZone: (noteId: string, label: string) =>
        run(
          { ...op("zone.remove", noteId, { noteId }), versionScope: visitScope },
          { zoneLabel: label },
        ),

      updatePhoto: (id: string, patch: PhotoPatch, name: string | null) =>
        run(op("photo.update", id, { id, patch }), { photoName: name }),
      setCoverPhoto: (id: string, name: string | null) =>
        run(op("photo.setCover", id, { id }), { photoName: name }),
      movePhoto: (id: string, direction: "before" | "after") =>
        run(op("photo.move", id, { id, direction })),
      deletePhoto: (id: string, name: string | null) =>
        run(op("photo.delete", id, { id }), { photoName: name }),

      createMarker: (input: { planId: string; page: number; x: number; y: number }) => {
        const id = uuidv7();
        return run(op("marker.create", id, { id, ...input }), {}, id);
      },
      moveMarker: (id: string, x: number, y: number, number: number | null) =>
        run(op("marker.move", id, { id, x, y }), { markerNumber: number }),
      updateMarker: (
        id: string,
        patch: { label?: string | null; photoId?: string | null },
        number: number | null,
      ) => run(op("marker.update", id, { id, ...patch }), { markerNumber: number }),
      deleteMarker: (id: string, number: number | null) =>
        run(op("marker.delete", id, { id }), { markerNumber: number }),

      createReserve: (values: ReserveFormValues) => {
        const id = uuidv7();
        return run(
          op("reserve.create", id, { id, values }),
          { reserveCode: "R-?", reserveAction: values.action },
          id,
        );
      },
      updateReserve: (id: string, values: ReserveFormValues, code: string) =>
        run(
          { ...op("reserve.update", id, { id, values }), versionScope: `reserve:${id}` },
          { reserveCode: code, reserveAction: values.action },
        ),
      setReserveStatus: (id: string, status: ReserveStatus, code: string, action: string) =>
        run(op("reserve.setStatus", id, { id, status }), {
          reserveCode: code,
          reserveAction: action,
        }),
      deleteReserve: (id: string, code: string, action: string) =>
        run(op("reserve.delete", id, { id }), { reserveCode: code, reserveAction: action }),
      placeReserve: (
        reserve: {
          id: string;
          code: string;
          action: string;
          marker: { id: string; planId: string } | null;
        },
        placement: { planId: string; page: number; x: number; y: number },
      ) => {
        // Same plan: the marker moves (same id, like the server); another plan: a new one.
        const markerId =
          reserve.marker && reserve.marker.planId === placement.planId
            ? reserve.marker.id
            : uuidv7();
        return run(
          op("reserve.place", reserve.id, { id: reserve.id, markerId, ...placement }),
          { reserveCode: reserve.code, reserveAction: reserve.action },
          markerId,
        );
      },
      unplaceReserve: (id: string, code: string, action: string) =>
        run(op("reserve.unplace", id, { id }), { reserveCode: code, reserveAction: action }),
      attachMarker: (id: string, markerId: string, code: string, action: string) =>
        run(op("reserve.attachMarker", id, { id, markerId }), {
          reserveCode: code,
          reserveAction: action,
        }),
    };
  }, [run, visitId]);
}

export type VisitMutations = ReturnType<typeof useVisitMutations>;
