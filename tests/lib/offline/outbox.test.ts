import { describe, expect, it } from "vitest";

import { applyLocally } from "@/lib/offline/local-apply";
import { enqueueOperation, listOutbox, rebaseScope } from "@/lib/offline/outbox";
import { mergeSnapshot } from "@/lib/offline/merge";

import { ALICE, freshDb, NOTE_ROOF, reserveValues, snapshot, VISIT } from "./fixtures";

const PHOTO = "019a2000-0000-7000-8000-000000000001";
const RESERVE = "019a2000-0000-7000-8000-000000000002";
const MARKER = "019a2000-0000-7000-8000-000000000003";
const PLAN = "70000000-0000-4000-8000-000000000001";

describe("outbox: grouping", () => {
  it("folds thirty keystrokes of a note into one operation with the first base version", async () => {
    const db = await freshDb();
    await mergeSnapshot(db, snapshot());
    for (let index = 1; index <= 30; index += 1) {
      await enqueueOperation(db, {
        visitId: VISIT,
        kind: "note.update",
        entityId: NOTE_ROOF,
        payload: { noteId: NOTE_ROOF, content: `Texte ${index}` },
        baseVersion: 2,
        versionScope: `note:${NOTE_ROOF}`,
        label: "Note : Toiture",
      });
    }
    const entries = await listOutbox(db, VISIT);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.payload).toEqual({ noteId: NOTE_ROOF, content: "Texte 30" });
    expect(entries[0]!.baseVersion).toBe(2);
  });

  it("folds an update of a reserve created offline into its creation", async () => {
    const db = await freshDb();
    await mergeSnapshot(db, snapshot());
    await enqueueOperation(db, {
      visitId: VISIT,
      kind: "reserve.create",
      entityId: RESERVE,
      payload: { id: RESERVE, values: reserveValues("Fuite quai 3") },
      label: "Réserve R-? : Fuite quai 3",
    });
    await enqueueOperation(db, {
      visitId: VISIT,
      kind: "reserve.update",
      entityId: RESERVE,
      payload: {
        id: RESERVE,
        values: reserveValues("Fuite quai 3 (urgent)", { priority: "urgent" }),
      },
      baseVersion: 1,
      versionScope: `reserve:${RESERVE}`,
      label: "Réserve R-? modifiée",
    });
    const entries = await listOutbox(db, VISIT);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.kind).toBe("reserve.create");
    expect((entries[0]!.payload as { values: { action: string } }).values.action).toBe(
      "Fuite quai 3 (urgent)",
    );
  });

  it("sends nothing for a reserve created, modified then deleted before the sync", async () => {
    const db = await freshDb();
    await mergeSnapshot(db, snapshot());
    await enqueueOperation(db, {
      visitId: VISIT,
      kind: "reserve.create",
      entityId: RESERVE,
      payload: { id: RESERVE, values: reserveValues("Éphémère") },
      label: "Réserve",
    });
    await enqueueOperation(db, {
      visitId: VISIT,
      kind: "reserve.place",
      entityId: RESERVE,
      payload: { id: RESERVE, markerId: MARKER, planId: PLAN, page: 1, x: 0.5, y: 0.5 },
      label: "Réserve placée",
    });
    const outcome = await enqueueOperation(db, {
      visitId: VISIT,
      kind: "reserve.delete",
      entityId: RESERVE,
      payload: { id: RESERVE },
      label: "Réserve supprimée",
    });
    expect(outcome.kind).toBe("cancelled");
    expect(await listOutbox(db, VISIT)).toEqual([]);
  });

  it("folds moves and labels into the creation of a marker, and merges photo patches", async () => {
    const db = await freshDb();
    await enqueueOperation(db, {
      visitId: VISIT,
      kind: "marker.create",
      entityId: MARKER,
      payload: { id: MARKER, planId: PLAN, page: 1, x: 0.1, y: 0.1 },
      label: "Repère",
    });
    await enqueueOperation(db, {
      visitId: VISIT,
      kind: "marker.move",
      entityId: MARKER,
      payload: { id: MARKER, x: 0.7, y: 0.6 },
      label: "Repère déplacé",
    });
    await enqueueOperation(db, {
      visitId: VISIT,
      kind: "marker.update",
      entityId: MARKER,
      payload: { id: MARKER, label: "Butoir quai 14" },
      label: "Repère : libellé",
    });
    const [entry] = await listOutbox(db, VISIT);
    expect(entry!.kind).toBe("marker.create");
    expect(entry!.payload).toMatchObject({ x: 0.7, y: 0.6, label: "Butoir quai 14" });

    await enqueueOperation(db, {
      visitId: VISIT,
      kind: "photo.update",
      entityId: PHOTO,
      payload: { id: PHOTO, patch: { caption: "Quai" } },
      label: "Légende",
    });
    await enqueueOperation(db, {
      visitId: VISIT,
      kind: "photo.update",
      entityId: PHOTO,
      payload: { id: PHOTO, patch: { category: "defect" } },
      label: "Légende",
    });
    const photoOps = (await listOutbox(db, VISIT)).filter((e) => e.kind === "photo.update");
    expect(photoOps).toHaveLength(1);
    expect(photoOps[0]!.payload).toEqual({
      id: PHOTO,
      patch: { caption: "Quai", category: "defect" },
    });
  });
});

describe("outbox: order and dependencies", () => {
  it("records that a reserve citing an offline photo depends on the photo, in creation order", async () => {
    const db = await freshDb();
    await mergeSnapshot(db, snapshot());
    const photo = await enqueueOperation(db, {
      visitId: VISIT,
      kind: "photo.create",
      entityId: PHOTO,
      payload: {
        id: PHOTO,
        item: {
          originalFilename: "IMG-0042.jpg",
          width: 1600,
          height: 1200,
          sizeBytes: 1000,
          thumbSizeBytes: 100,
          takenAt: null,
          zoneKey: null,
        },
      },
      label: "Photo IMG-0042",
      photo: { stage: "create", name: "IMG-0042.jpg", progress: 0, upload: null },
    });
    const reserve = await enqueueOperation(db, {
      visitId: VISIT,
      kind: "reserve.create",
      entityId: RESERVE,
      payload: { id: RESERVE, values: reserveValues("Avec photo", { photoIds: [PHOTO] }) },
      label: "Réserve",
    });
    const link = await enqueueOperation(db, {
      visitId: VISIT,
      kind: "reserve.place",
      entityId: RESERVE,
      payload: { id: RESERVE, markerId: MARKER, planId: PLAN, page: 1, x: 0.2, y: 0.2 },
      label: "Réserve placée",
    });
    const entries = await listOutbox(db, VISIT);
    expect(entries.map((e) => e.kind)).toEqual(["photo.create", "reserve.create", "reserve.place"]);
    expect(entries.map((e) => e.seq)).toEqual([1, 2, 3]);
    const photoOp = photo.kind === "queued" ? photo.entry.opId : "";
    const reserveOp = reserve.kind === "queued" ? reserve.entry.opId : "";
    expect(entries[1]!.dependsOn).toEqual([photoOp]);
    expect(entries[2]!.dependsOn).toEqual([reserveOp]);
    expect(link.kind).toBe("queued");
  });

  it("rebases the later operations of a scope after one is applied", async () => {
    const db = await freshDb();
    await enqueueOperation(db, {
      visitId: VISIT,
      kind: "visit.update",
      entityId: VISIT,
      payload: {
        patch: {
          type: "technical",
          reason: "periodic",
          title: "T",
          visitDate: "2026-11-09",
          subject: null,
          writerId: null,
        },
      },
      baseVersion: 3,
      versionScope: `visit:${VISIT}`,
      label: "Informations",
    });
    await enqueueOperation(db, {
      visitId: VISIT,
      kind: "participant.reorder",
      entityId: VISIT,
      payload: { orderedIds: [] },
      baseVersion: 3,
      versionScope: `visit:${VISIT}`,
      label: "Ordre",
    });
    await rebaseScope(db, `visit:${VISIT}`, 3, 4);
    const entries = await listOutbox(db, VISIT);
    expect(entries.map((e) => e.baseVersion)).toEqual([4, 4]);
  });
});

describe("optimistic local application", () => {
  it("creates a provisional reserve « R-? » and a marker « • », then removes both with the reserve", async () => {
    const db = await freshDb();
    await mergeSnapshot(db, snapshot());
    await applyLocally(
      db,
      VISIT,
      "reserve.create",
      { id: RESERVE, values: reserveValues("Fuite", { zoneKey: "docks" }) },
      { userId: ALICE.id, userName: ALICE.name },
    );
    const reserve = await db.reserves.get(RESERVE);
    expect(reserve).toMatchObject({
      code: "R-?",
      number: null,
      zoneLabel: "Quais",
      status: "open",
    });
    await applyLocally(
      db,
      VISIT,
      "reserve.place",
      { id: RESERVE, markerId: MARKER, planId: PLAN, page: 1, x: 0.3, y: 0.3 },
      { userId: ALICE.id, userName: ALICE.name },
    );
    expect(await db.markers.get(MARKER)).toMatchObject({ number: null, reserve: { code: "R-?" } });
    await applyLocally(
      db,
      VISIT,
      "reserve.delete",
      { id: RESERVE },
      { userId: ALICE.id, userName: ALICE.name },
    );
    expect(await db.reserves.get(RESERVE)).toBeUndefined();
    expect(await db.markers.get(MARKER)).toBeUndefined();
  });

  it("writes the note content without touching its version", async () => {
    const db = await freshDb();
    await mergeSnapshot(db, snapshot());
    await applyLocally(
      db,
      VISIT,
      "note.update",
      { noteId: NOTE_ROOF, content: "Nouveau" },
      { userId: ALICE.id, userName: ALICE.name },
    );
    expect(await db.notes.get(NOTE_ROOF)).toMatchObject({ content: "Nouveau", version: 2 });
  });
});
