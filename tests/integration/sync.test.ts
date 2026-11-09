import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { uuidv7 } from "@/lib/offline/ids";
import type { SyncOperation, SyncPayload, SyncResult } from "@/lib/offline/ops";
import { emptyReserveForm } from "@/lib/reserves/schema";
import type { CurrentUser } from "@/server/auth/types";
import { closePool } from "@/server/db/pool";
import { createPhotoService } from "@/server/photos/service";
import { createVisitRepository } from "@/server/repositories/visit-repository";
import { createZoneNoteRepository } from "@/server/repositories/zone-note-repository";
import { createReserveService } from "@/server/reserves/service";
import { LocalStorageService } from "@/server/storage/local";
import { serveLocalStorage } from "@/server/storage/local-route";
import { LOCAL_STORAGE_ROUTE } from "@/server/storage/local-signing";
import { applySyncBatch, applySyncOperation, type SyncContext } from "@/server/sync/apply";
import { buildVisitSnapshot } from "@/server/sync/snapshot";

/*
 * `POST /api/sync` without HTTP: the application layer, as the user, on `ronde_test`.
 * Operation ids are UUID v7-shaped; entity ids are chosen by the « device » like offline.
 */

const user = (id: string, role: CurrentUser["role"] = "rt"): CurrentUser => ({
  id,
  email: `${id.slice(-2)}@example.test`,
  fullName: "Fictif",
  role,
  mustChangePassword: false,
});
const ALICE = user("00000000-0000-4000-8000-000000000001");
const BRUNO = user("00000000-0000-4000-8000-000000000002");
const CLAIRE = user("00000000-0000-4000-8000-000000000003", "direction");
const EMMA = user("00000000-0000-4000-8000-000000000006");
const SITE_TOULOUSE = "10000000-0000-4000-8000-000000000004";
const SITE_MARSEILLE = "10000000-0000-4000-8000-000000000003";
const SECRET = "integration-sync-secret-32-characters-00000";
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]);

let dir = "";
let storage: LocalStorageService;
/**
 * A fresh UUID v7, as a device would make: never a counter, `sync_operations` keeps the
 * operations of earlier runs in ronde_test.
 */
function uuid(): string {
  return uuidv7();
}

function op<K extends SyncOperation["kind"]>(
  visitId: string,
  kind: K,
  payload: SyncPayload<K>,
  baseVersion?: number,
): SyncOperation<K> {
  return { opId: uuid(), visitId, kind, payload, baseVersion };
}

function ctx(current: CurrentUser): SyncContext {
  return { user: current, storage };
}

async function newVisit(actor: CurrentUser, siteId = SITE_TOULOUSE) {
  const visits = createVisitRepository(actor);
  const { id } = await visits.create({
    siteId,
    type: "technical",
    reason: "periodic",
    title: "Visite sync",
    visitDate: "2026-11-09",
    subject: null,
    writerId: actor.id,
  });
  const detail = await visits.getById(id);
  return { id, version: detail!.version };
}

async function put(target: { url: string; headers: Record<string, string> }, body: Uint8Array) {
  const request = new Request(`http://ronde.test${target.url}`, {
    method: "PUT",
    headers: target.headers,
    body: body as BodyInit,
  });
  const segments = new URL(request.url).pathname.slice(`${LOCAL_STORAGE_ROUTE}/`.length).split("/");
  expect((await serveLocalStorage(storage, SECRET, request, segments)).status).toBe(200);
}

function data(result: SyncResult): Record<string, unknown> {
  expect(result.status, JSON.stringify(result)).toBe("applied");
  return result.status === "applied" ? result.data : {};
}

beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "ronde-sync-"));
  storage = new LocalStorageService({ dir, secret: SECRET });
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
  await closePool();
});

describe("application and idempotence", () => {
  it("applies a note, then replays the very same operation with its stored result", async () => {
    const { id } = await newVisit(ALICE);
    const roof = (await createZoneNoteRepository(ALICE).list(id)).find(
      (n) => n.zoneKey === "roof",
    )!;
    const operation = op(id, "note.update", { noteId: roof.id, content: "Saisi hors réseau" }, 1);
    const first = await applySyncOperation(ctx(ALICE), operation);
    expect(data(first)).toMatchObject({ version: 2 });
    // Same opId again (the answer was lost on the way back): no false conflict.
    const again = await applySyncOperation(ctx(ALICE), operation);
    expect(data(again)).toMatchObject({ version: 2 });
    const note = (await createZoneNoteRepository(ALICE).list(id)).find((n) => n.id === roof.id)!;
    expect(note).toMatchObject({ content: "Saisi hors réseau", version: 2 });
  });

  it("answers `conflict` with the current state for a stale note version", async () => {
    const { id } = await newVisit(ALICE);
    const roof = (await createZoneNoteRepository(ALICE).list(id)).find(
      (n) => n.zoneKey === "roof",
    )!;
    await createZoneNoteRepository(ALICE).updateContent(roof.id, 1, "Version du PC");
    const result = await applySyncOperation(
      ctx(ALICE),
      op(id, "note.update", { noteId: roof.id, content: "Version de la tablette" }, 1),
    );
    expect(result.status).toBe("conflict");
    if (result.status === "conflict") {
      expect(result.current).toMatchObject({ content: "Version du PC", version: 2 });
    }
  });

  it("applies visit information and participants in order, with the chained versions", async () => {
    const { id, version } = await newVisit(ALICE);
    const participantId = uuid();
    const results = await applySyncBatch(ctx(ALICE), [
      op(
        id,
        "visit.update",
        {
          patch: {
            type: "technical",
            reason: "periodic",
            title: "Titre hors réseau",
            visitDate: "2026-11-09",
            subject: "Objet hors réseau",
            writerId: ALICE.id,
          },
        },
        version,
      ),
      op(
        id,
        "participant.add",
        {
          id: participantId,
          participant: {
            profileId: null,
            fullName: "Marc Imaginaire",
            company: null,
            jobTitle: null,
            email: null,
            isPresent: true,
            sortOrder: 0,
          },
        },
        version + 1,
      ),
    ]);
    expect(results.map((r) => r.status)).toEqual(["applied", "applied"]);
    expect(data(results[1]!)).toMatchObject({ id: participantId, version: version + 2 });
  });

  it("rejects a write of a reader (direction) and of an uninvolved rt with `forbidden`", async () => {
    const { id } = await newVisit(ALICE);
    const roof = (await createZoneNoteRepository(ALICE).list(id)).find(
      (n) => n.zoneKey === "roof",
    )!;
    for (const actor of [CLAIRE, EMMA]) {
      const result = await applySyncOperation(
        ctx(actor),
        op(id, "note.update", { noteId: roof.id, content: "Pirate" }, 1),
      );
      expect(result.status, actor.id).toBe("rejected");
      if (result.status === "rejected") expect(result.code).toBe("forbidden");
    }
  });

  it("rejects with `visit_completed` when the visit was completed meanwhile", async () => {
    const { id } = await newVisit(ALICE);
    const roof = (await createZoneNoteRepository(ALICE).list(id)).find(
      (n) => n.zoneKey === "roof",
    )!;
    await createVisitRepository(ALICE).complete(id);
    const results = await applySyncBatch(ctx(ALICE), [
      op(id, "note.update", { noteId: roof.id, content: "Trop tard" }, 1),
      op(id, "reserve.create", { id: uuid(), values: { ...emptyReserveForm(), action: "Tard" } }),
    ]);
    for (const result of results) {
      expect(result.status).toBe("rejected");
      if (result.status === "rejected") {
        expect(result.code).toBe("visit_completed");
        expect(result.message).toMatch(/terminée entre-temps/);
      }
    }
  });
});

describe("identifiers chosen by the device", () => {
  it("creates a reserve with the device id and numbers it on the server; a replay returns it", async () => {
    const { id } = await newVisit(ALICE);
    const reserveId = uuid();
    const operation = op(id, "reserve.create", {
      id: reserveId,
      values: { ...emptyReserveForm("docks"), action: "Fuite quai 3" },
    });
    const first = data(await applySyncOperation(ctx(ALICE), operation));
    expect(first.reserve).toMatchObject({ id: reserveId, code: expect.stringMatching(/^R-\d+$/) });
    // Same create replayed without the idempotence table (another opId, same entity id).
    const replay = data(await applySyncOperation(ctx(ALICE), { ...operation, opId: uuid() }));
    expect((replay.reserve as { id: string }).id).toBe(reserveId);
    const reserves = await createReserveService(ALICE, storage).listForVisit(id);
    expect(reserves.filter((r) => r.id === reserveId)).toHaveLength(1);
  });

  it("numbers reserves created offline by two devices on the same site without duplicate", async () => {
    const alice = await newVisit(ALICE, SITE_MARSEILLE);
    const bruno = await newVisit(BRUNO, SITE_MARSEILLE);
    const [a, b] = await Promise.all([
      applySyncOperation(
        ctx(ALICE),
        op(alice.id, "reserve.create", {
          id: uuid(),
          values: { ...emptyReserveForm(), action: "Tablette A" },
        }),
      ),
      applySyncOperation(
        ctx(BRUNO),
        op(bruno.id, "reserve.create", {
          id: uuid(),
          values: { ...emptyReserveForm(), action: "Tablette B" },
        }),
      ),
    ]);
    const numberA = (data(a).reserve as { number: number }).number;
    const numberB = (data(b).reserve as { number: number }).number;
    expect(numberA).not.toBe(numberB);
  });

  it("creates a photo with its id, signs the URLs, confirms it, and renews a cut-off upload", async () => {
    const { id } = await newVisit(ALICE);
    const photoId = uuid();
    const create = op(id, "photo.create", {
      id: photoId,
      item: {
        originalFilename: "IMG_0042.jpg",
        width: 1600,
        height: 1200,
        sizeBytes: JPEG.byteLength,
        thumbSizeBytes: JPEG.byteLength,
        takenAt: null,
        zoneKey: "docks",
      },
    });
    const first = data(await applySyncOperation(ctx(ALICE), create));
    const upload = first.upload as {
      photoId: string;
      main: { url: string; headers: Record<string, string> };
    };
    expect(upload.photoId).toBe(photoId);
    // The network was cut after the row was created: the same create answers with new URLs.
    const second = data(await applySyncOperation(ctx(ALICE), { ...create, opId: uuid() }));
    const renewed = second.upload as typeof upload & { thumb: typeof upload.main };
    await put(renewed.main, JPEG);
    await put(renewed.thumb, JPEG);
    const confirm = await applySyncOperation(ctx(ALICE), op(id, "photo.confirm", { id: photoId }));
    expect(data(confirm).photo).toMatchObject({ id: photoId, zoneKey: "docks" });
    // Once ready, the create itself answers with the photo.
    const third = data(await applySyncOperation(ctx(ALICE), { ...create, opId: uuid() }));
    expect((third.photo as { id: string }).id).toBe(photoId);
    expect((await createPhotoService(ALICE, storage).list(id)).map((p) => p.id)).toEqual([photoId]);
  });

  it("links a device-created photo to a device-created reserve and places it with a device marker", async () => {
    const { id } = await newVisit(ALICE, SITE_TOULOUSE);
    const photoId = uuid();
    const reserveId = uuid();
    const prepared = data(
      await applySyncOperation(
        ctx(ALICE),
        op(id, "photo.create", {
          id: photoId,
          item: {
            originalFilename: null,
            width: 10,
            height: 10,
            sizeBytes: JPEG.byteLength,
            thumbSizeBytes: JPEG.byteLength,
            takenAt: null,
            zoneKey: null,
          },
        }),
      ),
    ).upload as {
      main: { url: string; headers: Record<string, string> };
      thumb: { url: string; headers: Record<string, string> };
    };
    await put(prepared.main, JPEG);
    await put(prepared.thumb, JPEG);
    const results = await applySyncBatch(ctx(ALICE), [
      op(id, "photo.confirm", { id: photoId }),
      op(id, "reserve.create", {
        id: reserveId,
        values: { ...emptyReserveForm(), action: "Avec photo", photoIds: [photoId] },
      }),
    ]);
    expect(results.map((r) => r.status)).toEqual(["applied", "applied"]);
    const reserve = (await createReserveService(ALICE, storage).get(reserveId))!;
    expect(reserve.photos.map((p) => p.id)).toEqual([photoId]);
  });
});

describe("snapshot", () => {
  it("reads the whole visit as the user, and nothing for a reader without access", async () => {
    const { id } = await newVisit(ALICE);
    const snapshot = await buildVisitSnapshot(ALICE, storage, id);
    expect(snapshot).not.toBeNull();
    expect(snapshot!.visit).toMatchObject({ id, permissions: { canEdit: true } });
    expect(snapshot!.notes).toHaveLength(9);
    expect(snapshot!.user).toEqual({ id: ALICE.id, role: "rt" });
    const asClaire = await buildVisitSnapshot(CLAIRE, storage, id);
    expect(asClaire!.visit.permissions.canEdit).toBe(false);
    expect(
      await buildVisitSnapshot(ALICE, storage, "20000000-0000-4000-8000-000000000003"),
    ).toBeNull();
  });
});
