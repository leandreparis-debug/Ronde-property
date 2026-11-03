import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { sql } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { withSystem, withUser } from "@/server/db/context";
import { closePool } from "@/server/db/pool";
import { ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { PHOTO_CAP_MESSAGE } from "@/server/photos/repository";
import {
  createPhotoService,
  type PhotoService,
  purgeStalePendingPhotos,
} from "@/server/photos/service";
import type { PreparedPhotoUpload, PreparePhotoItem } from "@/server/photos/types";
import { createVisitRepository } from "@/server/repositories/visit-repository";
import { createZoneNoteRepository } from "@/server/repositories/zone-note-repository";
import { LocalStorageService } from "@/server/storage/local";
import { serveLocalStorage } from "@/server/storage/local-route";
import { LOCAL_STORAGE_ROUTE } from "@/server/storage/local-signing";

const USERS = {
  alice: { id: "00000000-0000-4000-8000-000000000001" },
  bruno: { id: "00000000-0000-4000-8000-000000000002" },
  claire: { id: "00000000-0000-4000-8000-000000000003" },
  david: { id: "00000000-0000-4000-8000-000000000004" },
  inactif: { id: "00000000-0000-4000-8000-000000000005" },
  emma: { id: "00000000-0000-4000-8000-000000000006" },
};
const SITE_TOULOUSE = "10000000-0000-4000-8000-000000000004";
const V1 = "20000000-0000-4000-8000-000000000001";
const V2_COMPLETED = "20000000-0000-4000-8000-000000000002";
const V3_DELETED = "20000000-0000-4000-8000-000000000003";
const SECRET = "integration-storage-secret-32-characters-00";
const BUCKET = "visit-photos";

let dir = "";
let storage: LocalStorageService;

function serviceFor(user: { id: string }): PhotoService {
  return createPhotoService(user, storage);
}

function item(overrides: Partial<PreparePhotoItem> = {}): PreparePhotoItem {
  return {
    originalFilename: "IMG_0001.jpg",
    width: 1600,
    height: 1200,
    sizeBytes: 11,
    thumbSizeBytes: 11,
    takenAt: "2026-05-04T08:00:00.000Z",
    zoneKey: null,
    ...overrides,
  };
}

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]);

/** Uploads through the signed URL exactly like the browser would, via the local route. */
async function putThrough(
  target: { url: string; headers: Record<string, string> },
  body: Uint8Array,
) {
  const request = new Request(`http://ronde.test${target.url}`, {
    method: "PUT",
    headers: target.headers,
    body: body as BodyInit,
  });
  const segments = new URL(request.url).pathname.slice(`${LOCAL_STORAGE_ROUTE}/`.length).split("/");
  const response = await serveLocalStorage(storage, SECRET, request, segments);
  expect(response.status, await response.clone().text()).toBe(200);
}

async function uploadBoth(prepared: PreparedPhotoUpload, main: Uint8Array = JPEG) {
  await putThrough(prepared.main, main);
  await putThrough(prepared.thumb, JPEG);
}

async function newVisit(user = USERS.alice) {
  const visits = createVisitRepository(user);
  const { id } = await visits.create({
    siteId: SITE_TOULOUSE,
    type: "technical",
    reason: "periodic",
    title: "Photos",
    visitDate: "2026-11-03",
    subject: null,
    writerId: user.id,
  });
  const detail = await visits.getById(id);
  return { id, version: detail!.version };
}

async function photosCount(visitId: string): Promise<number> {
  const row = await withUser(USERS.alice, (trx) =>
    trx
      .selectFrom("visit_summaries")
      .select("photos_count")
      .where("id", "=", visitId)
      .executeTakeFirstOrThrow(),
  );
  return Number(row.photos_count);
}

async function auditActions(entityId: string): Promise<string[]> {
  const rows = await withSystem("test.audit", (trx) =>
    trx
      .selectFrom("audit_log")
      .select("action")
      .where("entity_id", "=", entityId)
      .orderBy("id")
      .execute(),
  );
  return rows.map((row) => row.action);
}

beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "ronde-photos-"));
  storage = new LocalStorageService({ dir, secret: SECRET });
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
  await closePool();
});

describe("preparePhotoUpload", () => {
  it("lets Alice (creator) and Bruno (participant) prepare photos on V1 with two signed URLs each", async () => {
    for (const user of [USERS.alice, USERS.bruno]) {
      const [prepared] = await serviceFor(user).prepare(V1, [item()]);
      expect(prepared?.photoId).toMatch(/^[0-9a-f-]{36}$/);
      expect(prepared?.main.url).toContain(`/visit-photos/${V1}/${prepared?.photoId}.jpg?`);
      expect(prepared?.thumb.url).toContain(`${prepared?.photoId}_thumb.jpg?`);
      expect(prepared?.main.headers["Content-Type"]).toBe("image/jpeg");
      expect(new Date(prepared!.main.expiresAt).getTime()).toBeGreaterThan(Date.now());
      await serviceFor(user).discardPending(prepared!.photoId);
    }
  });

  it("refuses Emma (not involved), Claire (direction) and the inactive account, and completed or deleted visits", async () => {
    for (const user of [USERS.emma, USERS.claire, USERS.inactif]) {
      await expect(serviceFor(user).prepare(V1, [item()])).rejects.toBeInstanceOf(ForbiddenError);
    }
    await expect(serviceFor(USERS.bruno).prepare(V2_COMPLETED, [item()])).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(serviceFor(USERS.alice).prepare(V3_DELETED, [item()])).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    // No row was created by the refused calls.
    const count = await withSystem("test.count", (trx) =>
      trx
        .selectFrom("photos")
        .select((eb) => eb.fn.countAll<number>().as("count"))
        .where("visit_id", "in", [V2_COMPLETED, V3_DELETED])
        .where("upload_status", "=", "pending")
        .executeTakeFirstOrThrow(),
    );
    expect(Number(count.count)).toBe(0);
  });

  it("refuses beyond 500 photos per visit, pending ones included", async () => {
    const { id } = await newVisit();
    const service = serviceFor(USERS.alice);
    for (let batch = 0; batch < 10; batch += 1) {
      await service.prepare(
        id,
        Array.from({ length: 50 }, () => item()),
      );
    }
    await expect(service.prepare(id, [item()])).rejects.toThrow(PHOTO_CAP_MESSAGE);
    await expect(service.prepare(id, [item()])).rejects.toBeInstanceOf(ValidationError);
  });

  it("stores the declared metadata, the default category and the user as creator", async () => {
    const { id } = await newVisit();
    const [prepared] = await serviceFor(USERS.alice).prepare(id, [
      item({ zoneKey: "roof", originalFilename: "toiture.jpg", width: 1200, height: 1600 }),
    ]);
    const row = await withSystem("test.read", (trx) =>
      trx
        .selectFrom("photos")
        .select([
          "upload_status",
          "category",
          "zone_key",
          "original_filename",
          "width",
          "height",
          "size_bytes",
          "taken_at",
          "created_by",
          "is_cover",
          "sort_order",
        ])
        .where("id", "=", prepared!.photoId)
        .executeTakeFirstOrThrow(),
    );
    expect(row.upload_status).toBe("pending");
    expect(row.category).toBe("general");
    expect(row.zone_key).toBe("roof");
    expect(row.original_filename).toBe("toiture.jpg");
    expect([row.width, row.height]).toEqual([1200, 1600]);
    expect(Number(row.size_bytes)).toBe(11);
    expect(row.taken_at?.toISOString()).toBe("2026-05-04T08:00:00.000Z");
    expect(row.created_by).toBe(USERS.alice.id);
    expect(row.is_cover).toBe(false);
    expect(row.sort_order).toBe(0);
  });
});

describe("confirmPhotoUpload", () => {
  it("keeps the photo pending and invisible while an object is missing, then marks it ready", async () => {
    const { id } = await newVisit();
    const service = serviceFor(USERS.alice);
    const before = await photosCount(id);
    const [prepared] = await service.prepare(id, [item()]);

    const missing = await service.confirm(prepared!.photoId);
    expect(missing).toEqual({
      ok: false,
      error: "Fichier manquant : l'envoi n'a pas abouti.",
      retryable: true,
    });
    expect(await service.list(id)).toHaveLength(0);
    expect(await photosCount(id)).toBe(before);

    await uploadBoth(prepared!);
    const confirmed = await service.confirm(prepared!.photoId);
    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) return;
    expect(confirmed.photo.id).toBe(prepared!.photoId);
    expect(confirmed.photo.url).toContain(`${prepared!.photoId}.jpg?`);
    expect(confirmed.photo.thumbUrl).toContain(`${prepared!.photoId}_thumb.jpg?`);
    expect(confirmed.photo.category).toBe("general");

    const listed = await service.list(id);
    expect(listed.map((p) => p.id)).toEqual([prepared!.photoId]);
    expect(await photosCount(id)).toBe(before + 1);
    expect(await auditActions(prepared!.photoId)).toEqual(["photo.uploaded"]);

    // A second confirmation is idempotent.
    const again = await service.confirm(prepared!.photoId);
    expect(again.ok).toBe(true);
  });

  it("refuses an object whose size differs from the declared one", async () => {
    const { id } = await newVisit();
    const service = serviceFor(USERS.alice);
    const [prepared] = await service.prepare(id, [item({ sizeBytes: 11 })]);
    await putThrough(prepared!.main, JPEG.slice(0, 8));
    await putThrough(prepared!.thumb, JPEG);
    const result = await service.confirm(prepared!.photoId);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/incomplet/);
    expect(await service.list(id)).toHaveLength(0);
  });

  it("refuses the confirmation once the visit is completed, with a clear message", async () => {
    const { id } = await newVisit();
    const service = serviceFor(USERS.alice);
    const [prepared] = await service.prepare(id, [item()]);
    await uploadBoth(prepared!);
    await createVisitRepository(USERS.alice).complete(id);
    const result = await service.confirm(prepared!.photoId);
    expect(result).toEqual({
      ok: false,
      error: "La visite est terminée : la photo n'a pas été ajoutée.",
      retryable: false,
    });
  });

  it("delivers new upload URLs to the editors only", async () => {
    const [prepared] = await serviceFor(USERS.alice).prepare(V1, [item()]);
    const renewed = await serviceFor(USERS.bruno).renewUpload(prepared!.photoId);
    expect(renewed.photoId).toBe(prepared!.photoId);
    // Same second, same expiry: the local signature is deterministic, the URL may be identical.
    expect(renewed.main.url).toContain(`${prepared!.photoId}.jpg?`);
    await expect(serviceFor(USERS.claire).renewUpload(prepared!.photoId)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(serviceFor(USERS.emma).renewUpload(prepared!.photoId)).rejects.toThrow(
      "Cette visite n'est pas modifiable.",
    );
    await serviceFor(USERS.alice).discardPending(prepared!.photoId);
  });
});

describe("purge of stale pending photos", () => {
  it("removes the rows older than 24 h with their objects and keeps fresh or ready ones", async () => {
    const { id } = await newVisit();
    const service = serviceFor(USERS.alice);
    const [stale, fresh, ready] = await service.prepare(id, [item(), item(), item()]);
    await uploadBoth(stale!);
    await uploadBoth(ready!);
    expect((await service.confirm(ready!.photoId)).ok).toBe(true);
    await withSystem("test.backdate", (trx) =>
      trx
        .updateTable("photos")
        .set({ created_at: sql`now() - interval '2 days'` })
        .where("id", "in", [stale!.photoId, ready!.photoId])
        .execute(),
    );

    const purged = await purgeStalePendingPhotos(storage, { force: true });
    expect(purged).toBeGreaterThanOrEqual(1);
    const remaining = await withSystem("test.remaining", (trx) =>
      trx.selectFrom("photos").select("id").where("visit_id", "=", id).execute(),
    );
    expect(remaining.map((r) => r.id).sort()).toEqual([fresh!.photoId, ready!.photoId].sort());
    expect(await storage.stat(BUCKET, `${id}/${stale!.photoId}.jpg`)).toBeNull();
    expect(await storage.stat(BUCKET, `${id}/${stale!.photoId}_thumb.jpg`)).toBeNull();
    expect(await storage.stat(BUCKET, `${id}/${ready!.photoId}.jpg`)).not.toBeNull();
  });
});

describe("cover, order, edition, deletion", () => {
  async function readyPhotos(visitId: string, count: number, user = USERS.alice) {
    const service = serviceFor(user);
    const prepared = await service.prepare(
      visitId,
      Array.from({ length: count }, () => item()),
    );
    for (const p of prepared) {
      await uploadBoth(p);
      const result = await service.confirm(p.photoId);
      if (!result.ok) throw new Error(result.error);
    }
    return prepared.map((p) => p.photoId);
  }

  it("keeps a single cover even when two are requested at the same time", async () => {
    const { id } = await newVisit();
    const [a, b, c] = await readyPhotos(id, 3);
    const service = serviceFor(USERS.alice);
    const after = await service.setCover(a!);
    expect(after.filter((p) => p.isCover).map((p) => p.id)).toEqual([a]);

    await Promise.all([service.setCover(b!), serviceFor(USERS.alice).setCover(c!)]);
    const covers = (await service.list(id)).filter((p) => p.isCover);
    expect(covers).toHaveLength(1);
    expect([b, c]).toContain(covers[0]!.id);
  });

  it("moves a photo before and after its neighbours", async () => {
    const { id } = await newVisit();
    const [a, b, c] = await readyPhotos(id, 3);
    const service = serviceFor(USERS.alice);
    expect((await service.move(b!, "before")).map((p) => p.id)).toEqual([b, a, c]);
    expect((await service.move(b!, "before")).map((p) => p.id)).toEqual([b, a, c]);
    expect((await service.move(a!, "after")).map((p) => p.id)).toEqual([b, c, a]);
    await expect(serviceFor(USERS.claire).move(a!, "before")).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("updates the caption, the category and the zone, and refuses an unknown zone", async () => {
    const { id } = await newVisit();
    const [a] = await readyPhotos(id, 1);
    const service = serviceFor(USERS.alice);
    const updated = await service.update(a!, {
      caption: "  Butoir arraché  ",
      category: "defect",
      zoneKey: "docks",
    });
    expect(updated.caption).toBe("Butoir arraché");
    expect(updated.category).toBe("defect");
    expect(updated.zoneKey).toBe("docks");
    expect(updated.zoneLabel).toBe("Quais");
    expect((await service.update(a!, { caption: "   " })).caption).toBeNull();
    await expect(service.update(a!, { zoneKey: "nowhere" })).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(serviceFor(USERS.claire).update(a!, { caption: "x" })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(await service.countByZone(id)).toEqual({ docks: 1 });
  });

  it("deletes the row and both objects, and writes the audit entry", async () => {
    const { id } = await newVisit();
    const [a] = await readyPhotos(id, 1);
    const service = serviceFor(USERS.alice);
    await expect(serviceFor(USERS.claire).remove(a!)).rejects.toBeInstanceOf(ForbiddenError);
    await service.remove(a!);
    expect(await service.list(id)).toHaveLength(0);
    expect(await storage.stat(BUCKET, `${id}/${a}.jpg`)).toBeNull();
    expect(await storage.stat(BUCKET, `${id}/${a}_thumb.jpg`)).toBeNull();
    expect(await auditActions(a!)).toEqual(["photo.uploaded", "photo.deleted"]);
    await expect(service.remove(a!)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("refuses to remove a zone that still has photos, then accepts once they are moved", async () => {
    const { id, version } = await newVisit();
    const [a] = await readyPhotos(id, 1);
    const photos = serviceFor(USERS.alice);
    await photos.update(a!, { zoneKey: "facades" });
    const notes = createZoneNoteRepository(USERS.alice);
    const facades = (await notes.list(id)).find((n) => n.zoneKey === "facades")!;
    await expect(notes.remove(facades.id, version)).rejects.toThrow(
      "Déplacez ou retirez d'abord la photo liée.",
    );
    await photos.update(a!, { zoneKey: null });
    const result = await notes.remove(facades.id, version);
    expect(result.notes.map((n) => n.zoneKey)).not.toContain("facades");
  });

  it("hides the photos of a deleted visit from everyone but the admins", async () => {
    const photoId = "60000000-0000-4000-8000-0000000000a3";
    await withSystem("test.seed_deleted_visit_photo", (trx) =>
      trx
        .insertInto("photos")
        .values({
          id: photoId,
          visit_id: V3_DELETED,
          storage_path: `${V3_DELETED}/${photoId}.jpg`,
          thumb_path: `${V3_DELETED}/${photoId}_thumb.jpg`,
          mime_type: "image/jpeg",
          upload_status: "ready",
          size_bytes: 11,
        })
        .onConflict((oc) => oc.doNothing())
        .execute(),
    );
    expect(await serviceFor(USERS.claire).renewUrls([photoId])).toEqual([]);
    expect(await serviceFor(USERS.alice).list(V3_DELETED)).toEqual([]);
    expect((await serviceFor(USERS.david).renewUrls([photoId])).map((p) => p.id)).toEqual([
      photoId,
    ]);
  });
});
