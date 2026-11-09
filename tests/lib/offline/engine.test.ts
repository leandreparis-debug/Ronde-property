import { describe, expect, it } from "vitest";

import {
  backoffDelay,
  createSyncEngine,
  type SyncEngine,
  type SyncStatus,
} from "@/lib/offline/engine";
import { mergeSnapshot } from "@/lib/offline/merge";
import type { SyncOperation, SyncResult } from "@/lib/offline/ops";
import { TransportError } from "@/lib/offline/transport";

import {
  ALICE,
  fakeTransport,
  freshDb,
  NOTE_DOCKS,
  NOTE_ROOF,
  reserveValues,
  snapshot,
  VISIT,
} from "./fixtures";

const RESERVE = "019a3000-0000-7000-8000-000000000002";

function noteOp(content: string, noteId = NOTE_ROOF, baseVersion = 2) {
  return {
    visitId: VISIT,
    kind: "note.update" as const,
    entityId: noteId,
    payload: { noteId, content },
    baseVersion,
    versionScope: `note:${noteId}`,
    label: "Note : Toiture",
  };
}

function appliedNote(op: SyncOperation): SyncResult {
  return {
    opId: op.opId,
    status: "applied",
    data: { version: (op.baseVersion ?? 0) + 1, savedAt: "2026-11-09T09:00:00.000Z" },
  };
}

async function setup(
  answer: (op: SyncOperation) => SyncResult | Promise<SyncResult>,
  options: { online?: () => boolean } = {},
) {
  const db = await freshDb();
  await mergeSnapshot(db, snapshot());
  const transport = fakeTransport(answer);
  const statuses: SyncStatus[] = [];
  const timers: Array<{ fn: () => void; ms: number }> = [];
  const online = options.online ?? (() => true);
  const engine: SyncEngine = createSyncEngine({
    db,
    transport,
    user: ALICE,
    isOnline: online,
    setTimer: (fn, ms) => {
      timers.push({ fn, ms });
      return timers.length;
    },
    clearTimer: () => undefined,
    periodicMs: 30_000,
  });
  engine.onStatus((status) => statuses.push(status));
  return { db, transport, engine, statuses, timers };
}

describe("SyncEngine", () => {
  it("applies an operation online, advances the version and empties the outbox", async () => {
    const { db, engine, transport } = await setup(appliedNote);
    const queued = await engine.enqueue(noteOp("Hors réseau"));
    const outcome = await queued.wait();
    expect(outcome.status).toBe("applied");
    await engine.flush();
    expect(transport.sent).toHaveLength(1);
    expect(await db.outbox.count()).toBe(0);
    expect(await db.notes.get(NOTE_ROOF)).toMatchObject({ content: "Hors réseau", version: 3 });
    expect(engine.status()).toMatchObject({ state: "idle", pending: 0 });
    expect(engine.status().lastSyncAt).not.toBeNull();
  });

  it("keeps the operation and reports `offline` while the device has no network, then sends it in one batch", async () => {
    let online = false;
    const { db, engine, transport, timers } = await setup(appliedNote, { online: () => online });
    for (let index = 0; index < 5; index += 1) {
      const queued = await engine.enqueue(noteOp(`Frappe ${index}`));
      expect((await queued.wait()).status).toBe("queued");
    }
    await engine.enqueue(noteOp("Quais", NOTE_DOCKS, 1));
    expect(engine.status()).toMatchObject({ state: "offline", pending: 2 });
    expect(transport.sent).toHaveLength(0);
    // The periodic timer is armed while operations wait.
    expect(timers.some((timer) => timer.ms === 30_000)).toBe(true);

    online = true;
    await engine.flush();
    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0]!.map((op) => op.payload)).toEqual([
      { noteId: NOTE_ROOF, content: "Frappe 4" },
      { noteId: NOTE_DOCKS, content: "Quais" },
    ]);
    expect(await db.outbox.count()).toBe(0);
    expect(engine.status().state).toBe("idle");
  });

  it("backs off 1 s, 2 s, 4 s… up to 5 min after network failures", async () => {
    const { engine, transport, timers } = await setup(appliedNote);
    transport.failNext(new TransportError("network", "Hors connexion"));
    const queued = await engine.enqueue(noteOp("A"));
    expect((await queued.wait()).status).toBe("queued");
    const retries = () => timers.filter((t) => t.ms !== 30_000).map((t) => t.ms);
    expect(retries()).toEqual([1_000]);
    expect(engine.status()).toMatchObject({ state: "error", pending: 1 });
    expect(engine.status().message).toMatch(/Hors connexion : nouvelle tentative/);
    for (const expected of [2_000, 4_000, 8_000]) {
      transport.failNext(new TransportError("network", "Hors connexion"));
      await engine.flush();
      expect(retries().at(-1)).toBe(expected);
    }
    expect(backoffDelay(20)).toBe(300_000);
    await engine.flush();
    expect(engine.status()).toMatchObject({ state: "idle", pending: 0 });
  });

  it("interprets `conflict`: server text kept, mine set aside, later same-scope operations blocked", async () => {
    const { db, engine } = await setup((op) =>
      op.kind === "note.update" && op.baseVersion === 2
        ? {
            opId: op.opId,
            status: "conflict",
            message: "Bruno Fictif a modifié cette zone entre-temps.",
            current: {
              content: "Version de Bruno",
              version: 3,
              updatedAt: "2026-11-09T09:00:00.000Z",
              updatedByName: "Bruno Fictif",
            },
          }
        : appliedNote(op),
    );
    engine.pause();
    await engine.enqueue(noteOp("Mienne"));
    engine.resume();
    await engine.flush();
    const conflicts = await db.conflicts.toArray();
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      kind: "note.update",
      entityId: NOTE_ROOF,
      serverVersion: 3,
      mine: { noteId: NOTE_ROOF, content: "Mienne" },
    });
    expect(await db.notes.get(NOTE_ROOF)).toMatchObject({
      content: "Version de Bruno",
      version: 3,
    });
    expect(engine.status()).toMatchObject({ state: "conflict", conflicts: 1, pending: 0 });

    // Arbitration « Garder la mienne »: a new operation on the server version.
    const resolved = await engine.resolveConflict(conflicts[0]!, noteOp("Mienne", NOTE_ROOF, 3));
    expect((await resolved!.wait()).status).toBe("applied");
    await engine.flush();
    expect(await db.conflicts.count()).toBe(0);
    expect(await db.notes.get(NOTE_ROOF)).toMatchObject({ content: "Mienne", version: 4 });
    expect(engine.status().state).toBe("idle");
  });

  it("interprets `rejected`: kept for the user, dependants blocked, other entities untouched", async () => {
    const { db, engine } = await setup((op) =>
      op.kind === "reserve.create"
        ? {
            opId: op.opId,
            status: "rejected",
            code: "visit_completed",
            message: "La visite a été terminée entre-temps.",
          }
        : op.kind === "reserve.setStatus"
          ? {
              opId: op.opId,
              status: "rejected",
              code: "not_found",
              message: "Réserve introuvable.",
            }
          : appliedNote(op),
    );
    engine.pause();
    await engine.enqueue({
      visitId: VISIT,
      kind: "reserve.create",
      entityId: RESERVE,
      payload: { id: RESERVE, values: reserveValues("Refusée") },
      label: "Réserve R-? : Refusée",
    });
    await engine.enqueue({
      visitId: VISIT,
      kind: "reserve.setStatus",
      entityId: RESERVE,
      payload: { id: RESERVE, status: "done" },
      label: "Réserve : statut",
    });
    const note = await engine.enqueue(noteOp("Toujours envoyée"));
    // Paused: the screens learn at once that the operation waits.
    expect((await note.wait()).status).toBe("queued");
    engine.resume();
    await engine.flush();
    const entries = await db.outbox.toArray();
    expect(entries.some((e) => e.kind === "note.update")).toBe(false);
    expect(entries.map((e) => [e.kind, e.status])).toEqual(
      expect.arrayContaining([
        ["reserve.create", "rejected"],
        ["reserve.setStatus", "blocked"],
      ]),
    );
    expect(entries.find((e) => e.kind === "reserve.create")!.rejection).toMatchObject({
      code: "visit_completed",
    });
    expect(engine.status()).toMatchObject({ state: "error", rejected: 1, pending: 1 });
    // The input stays readable for « Copier le texte » / « Retirer ».
    await engine.remove(entries.find((e) => e.kind === "reserve.create")!.opId);
    await engine.remove(entries.find((e) => e.kind === "reserve.setStatus")!.opId);
    expect(engine.status()).toMatchObject({ rejected: 0, pending: 0 });
  });

  it("interprets `retry`: the operation stays pending with its error, a new attempt is scheduled", async () => {
    let attempts = 0;
    const { db, engine, timers } = await setup((op) => {
      attempts += 1;
      return attempts === 1
        ? { opId: op.opId, status: "retry", message: "Le serveur n'a pas pu appliquer…" }
        : appliedNote(op);
    });
    const queued = await engine.enqueue(noteOp("Réessayée"));
    expect((await queued.wait()).status).toBe("queued");
    expect((await db.outbox.toArray())[0]).toMatchObject({ status: "pending", attempts: 1 });
    await engine.flush();
    expect(engine.status().nextRetryAt).not.toBeNull();
    // The scheduled attempt (not an immediate re-send) applies it.
    expect(timers.length).toBeGreaterThan(0);
    timers.at(-1)!.fn();
    await engine.flush();
    expect(await db.outbox.count()).toBe(0);
  });

  it("asks to sign in again on 401 without losing the outbox, and reports a revocation", async () => {
    const { db, engine, transport } = await setup(appliedNote);
    const reasons: string[] = [];
    const engineWithHook = createSyncEngine({
      db,
      transport,
      user: ALICE,
      isOnline: () => true,
      setTimer: () => 0,
      clearTimer: () => undefined,
      onAuthFailure: (reason) => reasons.push(reason),
    });
    engine.dispose();
    transport.failNext(new TransportError("auth", "Session expirée", { reason: "signed_out" }));
    await engineWithHook.enqueue(noteOp("Gardée"));
    await engineWithHook.flush();
    expect(engineWithHook.status()).toMatchObject({
      state: "auth",
      authReason: "signed_out",
      pending: 1,
    });
    expect(await db.outbox.count()).toBe(1);
    expect(reasons).toEqual(["signed_out"]);
    transport.failNext(new TransportError("auth", "Révoquée", { reason: "revoked" }));
    await engineWithHook.flush();
    expect(reasons).toEqual(["signed_out", "revoked"]);
  });

  it("runs the photo pipeline: create (URLs), put, confirm; blobs dropped when the visit is not kept", async () => {
    const { db, engine, transport } = await setup((op) => {
      if (op.kind === "photo.create") {
        return {
          opId: op.opId,
          status: "applied",
          data: {
            upload: {
              photoId: (op.payload as { id: string }).id,
              main: { url: "/put/main", headers: {}, expiresAt: "" },
              thumb: { url: "/put/thumb", headers: {}, expiresAt: "" },
            },
          },
        };
      }
      if (op.kind === "photo.confirm") {
        return {
          opId: op.opId,
          status: "applied",
          data: {
            photo: {
              id: (op.payload as { id: string }).id,
              visitId: VISIT,
              caption: null,
              category: "general",
              zoneKey: null,
              zoneLabel: null,
              takenAt: null,
              width: 10,
              height: 10,
              sizeBytes: 3,
              sortOrder: 0,
              isCover: false,
              originalFilename: "IMG-0042.jpg",
              createdByName: ALICE.name,
              createdAt: "2026-11-09T09:00:00.000Z",
              url: "/read/main",
              thumbUrl: "/read/thumb",
              urlsExpireAt: "2026-11-09T09:10:00.000Z",
            },
          },
        };
      }
      return appliedNote(op);
    });
    const photoId = "019a3000-0000-7000-8000-000000000009";
    const queued = await engine.enqueuePhoto({
      visitId: VISIT,
      photoId,
      item: {
        originalFilename: "IMG-0042.jpg",
        width: 10,
        height: 10,
        sizeBytes: 3,
        thumbSizeBytes: 3,
        takenAt: null,
        zoneKey: null,
      },
      main: new Blob([new Uint8Array([1, 2, 3])]),
      thumb: new Blob([new Uint8Array([1, 2, 3])]),
      name: "IMG-0042.jpg",
    });
    expect((await queued.wait()).status).toBe("applied");
    expect(transport.sent.map((batch) => batch.map((op) => op.kind))).toEqual([
      ["photo.create"],
      ["photo.confirm"],
    ]);
    expect(await db.outbox.count()).toBe(0);
    expect(await db.photos.get(photoId)).toMatchObject({
      uploadStatus: "ready",
      url: "/read/main",
    });
    expect(await db.blobs.count()).toBe(0);
    expect(engine.status().recent).toHaveLength(1);
  });
});
