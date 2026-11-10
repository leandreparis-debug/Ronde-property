import Dexie from "dexie";
import { describe, expect, it } from "vitest";

import { LOCAL_SCHEMA_VERSIONS, localDbName, RondeLocalDb } from "@/lib/offline/db";
import { isUuid, uuidv7 } from "@/lib/offline/ids";
import { estimateKeepSize, keepVisitOffline, planKeepItems, unkeepVisit } from "@/lib/offline/keep";
import { mergeSnapshot, removeVisitLocally } from "@/lib/offline/merge";
import type { SyncPayload } from "@/lib/offline/ops";
import { enqueueOperation } from "@/lib/offline/outbox";
import { computeUsage, formatBytes } from "@/lib/offline/storage";
import { shouldWipeForInactivity, wipeLocalData } from "@/lib/offline/wipe";

import { ALICE, BRUNO, freshDb, NOTE_ROOF, snapshot, VISIT } from "./fixtures";

describe("uuid v7", () => {
  it("produces valid, time-ordered identifiers", () => {
    const first = uuidv7(1_700_000_000_000);
    const second = uuidv7(1_700_000_000_001);
    expect(isUuid(first)).toBe(true);
    expect(first.charAt(14)).toBe("7");
    expect(first < second).toBe(true);
    expect(new Set(Array.from({ length: 200 }, () => uuidv7())).size).toBe(200);
  });
});

describe("snapshot merge", () => {
  it("writes the server rows and never overwrites what waits in the outbox", async () => {
    const db = await freshDb();
    await mergeSnapshot(db, snapshot());
    await enqueueOperation(db, {
      visitId: VISIT,
      kind: "note.update",
      entityId: NOTE_ROOF,
      payload: { noteId: NOTE_ROOF, content: "Texte local" },
      baseVersion: 2,
      versionScope: `note:${NOTE_ROOF}`,
      label: "Note : Toiture",
    });
    await db.notes.update(NOTE_ROOF, { content: "Texte local" });
    const fresh = snapshot();
    fresh.notes[0]!.content = "Texte du serveur";
    fresh.notes[0]!.version = 5;
    fresh.notes[1]!.content = "Quais du serveur";
    fresh.visit.title = "Titre du serveur";
    await mergeSnapshot(db, fresh);
    expect(await db.notes.get(NOTE_ROOF)).toMatchObject({ content: "Texte local", version: 2 });
    expect(await db.notes.get(fresh.notes[1]!.id)).toMatchObject({ content: "Quais du serveur" });
    expect(await db.visits.get(VISIT)).toMatchObject({ title: "Titre du serveur", version: 3 });
  });

  it("drops the rows the server no longer has, unless an operation cites them", async () => {
    const db = await freshDb();
    await mergeSnapshot(db, snapshot());
    expect(await db.notes.count()).toBe(2);
    const fresh = snapshot();
    fresh.notes = [fresh.notes[0]!];
    await mergeSnapshot(db, fresh);
    expect(await db.notes.count()).toBe(1);
  });
});

describe("version of a change made before the local copy is written", () => {
  it("uses the version shown when the store does not hold the visit yet, the stored one otherwise", async () => {
    const db = await freshDb();
    const early = await enqueueOperation(db, {
      visitId: VISIT,
      kind: "visit.update",
      entityId: VISIT,
      payload: { patch: { subject: "Saisi tout de suite" } } as SyncPayload<"visit.update">,
      versionScope: `visit:${VISIT}`,
      fallbackVersion: 3,
      label: "Informations",
    });
    expect(early.kind === "queued" && early.entry.baseVersion).toBe(3);
    await db.outbox.clear();
    await mergeSnapshot(db, snapshot());
    const later = await enqueueOperation(db, {
      visitId: VISIT,
      kind: "visit.update",
      entityId: VISIT,
      payload: { patch: { subject: "Après la copie" } } as SyncPayload<"visit.update">,
      versionScope: `visit:${VISIT}`,
      fallbackVersion: 1,
      label: "Informations",
    });
    const stored = (await db.visits.get(VISIT))!.version;
    expect(later.kind === "queued" && later.entry.baseVersion).toBe(stored);
  });
});

describe("erasing and isolation", () => {
  it("wipes the whole database of the user", async () => {
    const db = await freshDb();
    await mergeSnapshot(db, snapshot());
    const name = db.name;
    await wipeLocalData(db);
    expect(await Dexie.exists(name)).toBe(false);
  });

  it("keeps one database per user: Bruno never sees Alice's outbox", async () => {
    const alice = new RondeLocalDb(ALICE.id);
    const bruno = new RondeLocalDb(BRUNO.id);
    await Dexie.delete(localDbName(ALICE.id));
    await Dexie.delete(localDbName(BRUNO.id));
    await mergeSnapshot(alice, snapshot());
    await enqueueOperation(alice, {
      visitId: VISIT,
      kind: "note.update",
      entityId: NOTE_ROOF,
      payload: { noteId: NOTE_ROOF, content: "Secret d'Alice" },
      label: "Note",
    });
    expect(alice.name).not.toBe(bruno.name);
    expect(await bruno.outbox.count()).toBe(0);
    expect(await bruno.visits.count()).toBe(0);
    expect(await alice.outbox.count()).toBe(1);
    alice.close();
    bruno.close();
  });

  it("decides the wipe after 14 days without server contact", () => {
    const now = Date.parse("2026-11-23T12:00:00.000Z");
    expect(shouldWipeForInactivity("2026-11-10T12:00:00.000Z", undefined, now)).toBe(false);
    expect(shouldWipeForInactivity("2026-11-08T12:00:00.000Z", undefined, now)).toBe(true);
    expect(shouldWipeForInactivity(undefined, "2026-11-01T12:00:00.000Z", now)).toBe(true);
    expect(shouldWipeForInactivity(undefined, undefined, now)).toBe(false);
  });
});

describe("local schema migration", () => {
  it("opens a database created by an older version and keeps its outbox", async () => {
    const userId = "00000000-0000-4000-8000-00000000mig1";
    await Dexie.delete(localDbName(userId));
    const old = new RondeLocalDb(userId, LOCAL_SCHEMA_VERSIONS.slice(0, 1));
    await enqueueOperation(old, {
      visitId: VISIT,
      kind: "note.update",
      entityId: NOTE_ROOF,
      payload: { noteId: NOTE_ROOF, content: "Avant migration" },
      label: "Note",
    });
    old.close();
    const next = new RondeLocalDb(userId, [
      ...LOCAL_SCHEMA_VERSIONS,
      {
        version: LOCAL_SCHEMA_VERSIONS.length + 1,
        stores: { outbox: "opId, seq, visitId, entityId, status, [visitId+seq], kind" },
        upgrade: async (transaction) => {
          await transaction
            .table("outbox")
            .toCollection()
            .modify((entry: { attempts: number }) => {
              entry.attempts = 0;
            });
        },
      },
    ]);
    const entries = await next.outbox.toArray();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.payload).toEqual({ noteId: NOTE_ROOF, content: "Avant migration" });
    expect(next.verno).toBe(LOCAL_SCHEMA_VERSIONS.length + 1);
    next.close();
  });
});

describe("storage estimate", () => {
  it("computes the ratio and the 80 % warning", () => {
    expect(computeUsage(800, 1000, true)).toMatchObject({ ratio: 0.8, nearQuota: true });
    expect(computeUsage(100, 1000, null)).toMatchObject({ ratio: 0.1, nearQuota: false });
    expect(computeUsage(undefined, undefined, null)).toMatchObject({
      ratio: null,
      nearQuota: false,
    });
    expect(formatBytes(1536)).toBe("2 Ko");
    expect(formatBytes(2.5 * 1024 * 1024)).toBe("2,5 Mo");
  });

  it("estimates the offline copy from photos and useful plan pages, then downloads it", async () => {
    const db = await freshDb();
    const snap = snapshot({
      photos: [
        {
          id: "60000000-0000-4000-8000-000000000001",
          visitId: VISIT,
          caption: null,
          category: "general",
          zoneKey: null,
          zoneLabel: null,
          toSort: false,
          hintViewId: null,
          takenAt: null,
          width: 1600,
          height: 1200,
          sizeBytes: 300_000,
          sortOrder: 0,
          isCover: false,
          originalFilename: null,
          createdByName: null,
          createdAt: "2026-11-09T08:00:00.000Z",
          url: "/photo/main",
          thumbUrl: "/photo/thumb",
          urlsExpireAt: "",
        },
      ],
      plans: [
        {
          id: "70000000-0000-4000-8000-000000000001",
          siteId: "x",
          name: "Plan",
          mimeType: "application/pdf",
          pageCount: 2,
          isArchived: false,
          uploadedByName: null,
          createdAt: "",
          thumbUrl: null,
          markersCount: 0,
        },
        {
          id: "70000000-0000-4000-8000-000000000002",
          siteId: "x",
          name: "Archivé",
          mimeType: "application/pdf",
          pageCount: 2,
          isArchived: true,
          uploadedByName: null,
          createdAt: "",
          thumbUrl: null,
          markersCount: 1,
        },
      ],
      planPages: {
        "70000000-0000-4000-8000-000000000001": [1, 2].map((n) => ({
          pageNumber: n,
          width: 3500,
          height: 2400,
          imageMime: "image/png" as const,
          imageUrl: `/p1/${n}`,
          thumbUrl: `/p1/${n}/thumb`,
          urlsExpireAt: "",
        })),
        "70000000-0000-4000-8000-000000000002": [1, 2].map((n) => ({
          pageNumber: n,
          width: 3500,
          height: 2400,
          imageMime: "image/png" as const,
          imageUrl: `/p2/${n}`,
          thumbUrl: `/p2/${n}/thumb`,
          urlsExpireAt: "",
        })),
      },
      markers: [
        {
          id: "80000000-0000-4000-8000-000000000001",
          visitId: VISIT,
          planId: "70000000-0000-4000-8000-000000000002",
          page: 2,
          x: 0.5,
          y: 0.5,
          number: 1,
          kind: "photo",
          label: null,
          photoId: null,
          photoThumbUrl: null,
          photoCaption: null,
          reserve: null,
          createdAt: "",
          updatedAt: "",
        },
      ],
    });
    const items = planKeepItems(snap);
    // 2 photo files + 2 pages × 2 files of the active plan + the marked page (2 files) of the archived one.
    expect(items).toHaveLength(2 + 4 + 2);
    expect(items.some((item) => item.url === "/p2/1")).toBe(false);
    expect(estimateKeepSize(snap)).toBeGreaterThan(300_000);
    const fetched: string[] = [];
    const keptDuringDownload: boolean[] = [];
    const result = await keepVisitOffline(db, snap, {
      fetchBlob: async (url) => {
        fetched.push(url);
        // « Disponible hors réseau » only once every image is on the device.
        keptDuringDownload.push(Boolean((await db.visits.get(VISIT))?.kept));
        if (url === "/p1/2") throw new Error("coupure");
        return new Blob([new Uint8Array([1, 2])]);
      },
      concurrency: 2,
    });
    expect(result).toEqual({ downloaded: 7, failed: 1, bytes: 14 });
    expect(keptDuringDownload.every((kept) => !kept)).toBe(true);
    expect(await db.visits.get(VISIT)).toMatchObject({ kept: true });
    // A second call only fetches what is missing.
    const again = await keepVisitOffline(db, snap, {
      fetchBlob: async () => new Blob([new Uint8Array([1, 2])]),
    });
    expect(again).toEqual({ downloaded: 1, failed: 0, bytes: 2 });
    expect(await unkeepVisit(db, VISIT)).toEqual({ ok: true });
    expect(await db.blobs.count()).toBe(0);
    await removeVisitLocally(db, VISIT);
    expect(await db.visits.count()).toBe(0);
  });
});
