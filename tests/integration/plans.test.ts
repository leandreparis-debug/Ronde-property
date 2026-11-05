import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { sql } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { withSystem } from "@/server/db/context";
import { closePool } from "@/server/db/pool";
import { ForbiddenError, ValidationError } from "@/server/errors";
import { createPhotoService } from "@/server/photos/service";
import {
  createPlanService,
  type PlanService,
  purgeStalePendingPlans,
} from "@/server/plans/service";
import type { PreparedPageUpload, PreparedPlanUpload } from "@/server/plans/types";
import { createVisitRepository } from "@/server/repositories/visit-repository";
import { LocalStorageService } from "@/server/storage/local";
import { serveLocalStorage } from "@/server/storage/local-route";
import { LOCAL_STORAGE_ROUTE } from "@/server/storage/local-signing";

const USERS = {
  alice: { id: "00000000-0000-4000-8000-000000000001" },
  bruno: { id: "00000000-0000-4000-8000-000000000002" },
  claire: { id: "00000000-0000-4000-8000-000000000003" },
  david: { id: "00000000-0000-4000-8000-000000000004" },
  emma: { id: "00000000-0000-4000-8000-000000000006" },
};
const SITE_TOULOUSE = "10000000-0000-4000-8000-000000000004";
const SITE_LILLE = "10000000-0000-4000-8000-000000000002";
const SECRET = "integration-plans-secret-32-characters-0000";
const BUCKET = "site-plans";

let dir = "";
let storage: LocalStorageService;

const PDF = new TextEncoder().encode("%PDF-1.7\n% fictif\n");
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0]);

function serviceFor(user: { id: string }): PlanService {
  return createPlanService(user, storage);
}

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

async function uploadAll(original: PreparedPlanUpload, pages: PreparedPageUpload[]) {
  await putThrough(original.original, PDF);
  for (const page of pages) {
    await putThrough(page.image, PNG);
    await putThrough(page.thumb, JPEG);
  }
}

/** Imports a ready plan with `pageCount` pages on a site, as the given user. */
async function importPlan(
  user: { id: string },
  siteId = SITE_TOULOUSE,
  pageCount = 2,
  name = "Plan de test",
) {
  const service = serviceFor(user);
  const prepared = await service.prepare(siteId, {
    name,
    mimeType: "application/pdf",
    sizeBytes: PDF.byteLength,
    pageCount,
  });
  const pages = await service.preparePages(
    prepared.planId,
    Array.from({ length: pageCount }, (_, i) => ({
      pageNumber: i + 1,
      imageMime: "image/png" as const,
      width: 3500,
      height: 2475,
      sizeBytes: PNG.byteLength,
      thumbSizeBytes: JPEG.byteLength,
    })),
  );
  await uploadAll(prepared, pages);
  const confirmed = await service.confirm(prepared.planId);
  if (!confirmed.ok) throw new Error(confirmed.error);
  return prepared.planId;
}

async function newVisit(user = USERS.alice, siteId = SITE_TOULOUSE) {
  const visits = createVisitRepository(user);
  const { id } = await visits.create({
    siteId,
    type: "technical",
    reason: "periodic",
    title: "Plans",
    visitDate: "2026-11-04",
    subject: null,
    writerId: user.id,
  });
  return id;
}

async function readyPhoto(visitId: string): Promise<string> {
  const photos = createPhotoService(USERS.alice, storage);
  const [prepared] = await photos.prepare(visitId, [
    {
      originalFilename: "p.jpg",
      width: 10,
      height: 10,
      sizeBytes: JPEG.byteLength,
      thumbSizeBytes: JPEG.byteLength,
      takenAt: null,
      zoneKey: null,
    },
  ]);
  const photoStorage = storage;
  for (const target of [prepared!.main, prepared!.thumb]) {
    const request = new Request(`http://ronde.test${target.url}`, {
      method: "PUT",
      headers: target.headers,
      body: JPEG as BodyInit,
    });
    const segments = new URL(request.url).pathname
      .slice(`${LOCAL_STORAGE_ROUTE}/`.length)
      .split("/");
    expect((await serveLocalStorage(photoStorage, SECRET, request, segments)).status).toBe(200);
  }
  const confirmed = await photos.confirm(prepared!.photoId);
  if (!confirmed.ok) throw new Error(confirmed.error);
  return prepared!.photoId;
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
  dir = await mkdtemp(path.join(os.tmpdir(), "ronde-plans-"));
  storage = new LocalStorageService({ dir, secret: SECRET });
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
  await closePool();
});

describe("plan import", () => {
  it("runs prepare → pages → confirm, and lists the plan with its pages for everyone", async () => {
    const planId = await importPlan(USERS.alice, SITE_TOULOUSE, 3, "Plan masse e2e");
    const listed = await serviceFor(USERS.claire).listForSite(SITE_TOULOUSE);
    const plan = listed.find((p) => p.id === planId);
    expect(plan?.pageCount).toBe(3);
    expect(plan?.thumbUrl).toContain(`/${planId}/p1_thumb.jpg?`);
    const detail = await serviceFor(USERS.claire).getDetail(planId);
    expect(detail.pages.map((p) => p.pageNumber)).toEqual([1, 2, 3]);
    expect(detail.pages[1]?.imageUrl).toContain(`/${planId}/p2.png?`);
    expect(detail.originalUrl).toContain(`/${planId}/original.pdf?`);
    expect(await auditActions(planId)).toEqual(["site_plan.imported"]);
  });

  it("lets Alice, Emma (rt not involved) and David import, and refuses Claire", async () => {
    for (const user of [USERS.alice, USERS.emma, USERS.david]) {
      expect(await importPlan(user)).toMatch(/^[0-9a-f-]{36}$/);
    }
    await expect(
      serviceFor(USERS.claire).prepare(SITE_TOULOUSE, {
        name: "Interdit",
        mimeType: "application/pdf",
        sizeBytes: 10,
        pageCount: 1,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("keeps the plan pending and invisible while an object is missing", async () => {
    const service = serviceFor(USERS.alice);
    const prepared = await service.prepare(SITE_TOULOUSE, {
      name: "Incomplet",
      mimeType: "application/pdf",
      sizeBytes: PDF.byteLength,
      pageCount: 1,
    });
    const pages = await service.preparePages(prepared.planId, [
      {
        pageNumber: 1,
        imageMime: "image/png",
        width: 10,
        height: 10,
        sizeBytes: PNG.byteLength,
        thumbSizeBytes: 11,
      },
    ]);
    await putThrough(prepared.original, PDF);
    await putThrough(pages[0]!.image, PNG);
    const result = await service.confirm(prepared.planId);
    expect(result).toEqual({
      ok: false,
      error: "Fichier manquant : l'envoi n'a pas abouti.",
      retryable: true,
    });
    const listed = await serviceFor(USERS.bruno).listForSite(SITE_TOULOUSE);
    expect(listed.some((p) => p.id === prepared.planId)).toBe(false);
    // Cancelling removes the row and the objects.
    await service.discard(prepared.planId);
    const row = await withSystem("test.read", (trx) =>
      trx
        .selectFrom("site_plans")
        .select("id")
        .where("id", "=", prepared.planId)
        .executeTakeFirst(),
    );
    expect(row).toBeUndefined();
    expect(
      await storage.stat(BUCKET, `${SITE_TOULOUSE}/${prepared.planId}/original.pdf`),
    ).toBeNull();
  });

  it("accepts pages one at a time, replaces a retried page, refuses a page beyond the count", async () => {
    const service = serviceFor(USERS.alice);
    const prepared = await service.prepare(SITE_TOULOUSE, {
      name: "Page par page",
      mimeType: "application/pdf",
      sizeBytes: PDF.byteLength,
      pageCount: 2,
    });
    const page = (n: number, mime: "image/png" | "image/jpeg" = "image/png") => ({
      pageNumber: n,
      imageMime: mime,
      width: 10,
      height: 10,
      sizeBytes: PNG.byteLength,
      thumbSizeBytes: JPEG.byteLength,
    });
    const [first] = await service.preparePages(prepared.planId, [page(1)]);
    await putThrough(prepared.original, PDF);
    await putThrough(first!.image, PNG);
    await putThrough(first!.thumb, JPEG);
    // Only one page of two: not confirmable yet.
    expect((await service.confirm(prepared.planId)).ok).toBe(false);
    await expect(service.preparePages(prepared.planId, [page(3)])).rejects.toBeInstanceOf(
      ValidationError,
    );
    const [again] = await service.preparePages(prepared.planId, [page(2)]);
    const [retried] = await service.preparePages(prepared.planId, [page(2)]);
    expect(retried!.image.url.split("?")[0]).toBe(again!.image.url.split("?")[0]);
    await putThrough(retried!.image, PNG);
    await putThrough(retried!.thumb, JPEG);
    const confirmed = await service.confirm(prepared.planId);
    expect(confirmed.ok ? confirmed.plan.pageCount : confirmed.error).toBe(2);
  });

  it("refuses new pages once the plan is ready", async () => {
    const planId = await importPlan(USERS.alice);
    await expect(
      serviceFor(USERS.alice).preparePages(planId, [
        {
          pageNumber: 3,
          imageMime: "image/png",
          width: 10,
          height: 10,
          sizeBytes: 10,
          thumbSizeBytes: 10,
        },
      ]),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("renames, archives and unarchives with audit entries", async () => {
    const planId = await importPlan(USERS.alice);
    const service = serviceFor(USERS.bruno);
    expect((await service.rename(planId, "Plan des quais")).name).toBe("Plan des quais");
    expect((await service.setArchived(planId, true)).isArchived).toBe(true);
    expect(
      (await serviceFor(USERS.claire).listForSite(SITE_TOULOUSE)).some((p) => p.id === planId),
    ).toBe(false);
    expect(
      (await serviceFor(USERS.claire).listForSite(SITE_TOULOUSE, { includeArchived: true })).some(
        (p) => p.id === planId,
      ),
    ).toBe(true);
    expect((await service.setArchived(planId, false)).isArchived).toBe(false);
    await expect(serviceFor(USERS.claire).rename(planId, "Non")).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(await auditActions(planId)).toEqual([
      "site_plan.imported",
      "site_plan.renamed",
      "site_plan.archived",
      "site_plan.unarchived",
    ]);
  });

  it("purges pending plans older than 24 h with their objects", async () => {
    const service = serviceFor(USERS.alice);
    const prepared = await service.prepare(SITE_TOULOUSE, {
      name: "Abandonné",
      mimeType: "application/pdf",
      sizeBytes: PDF.byteLength,
      pageCount: 1,
    });
    const pages = await service.preparePages(prepared.planId, [
      {
        pageNumber: 1,
        imageMime: "image/png",
        width: 10,
        height: 10,
        sizeBytes: PNG.byteLength,
        thumbSizeBytes: 11,
      },
    ]);
    await uploadAll(prepared, pages);
    await withSystem("test.backdate", (trx) =>
      trx
        .updateTable("site_plans")
        .set({ created_at: sql`now() - interval '2 days'` })
        .where("id", "=", prepared.planId)
        .execute(),
    );
    expect(await purgeStalePendingPlans(storage, { force: true })).toBeGreaterThanOrEqual(1);
    expect(
      await storage.stat(BUCKET, `${SITE_TOULOUSE}/${prepared.planId}/original.pdf`),
    ).toBeNull();
    expect(await storage.stat(BUCKET, `${SITE_TOULOUSE}/${prepared.planId}/p1.png`)).toBeNull();
  });
});

describe("markers", () => {
  it("numbers markers per (visit, plan), keeps numbers stable after a removal", async () => {
    const planId = await importPlan(USERS.alice);
    const visitId = await newVisit();
    const markers = serviceFor(USERS.alice).markers;
    const m1 = await markers.create(visitId, { planId, page: 1, x: 0.1, y: 0.2 });
    const m2 = await markers.create(visitId, {
      planId,
      page: 2,
      x: 0.3,
      y: 0.4,
      label: "  Quai 3 ",
    });
    expect([m1.number, m2.number]).toEqual([1, 2]);
    expect(m2.label).toBe("Quai 3");
    // Removing the last marker does not give its number back (counter, migration 17).
    await markers.remove(m2.id);
    const m3 = await markers.create(visitId, { planId, page: 1, x: 0.5, y: 0.5 });
    expect(m3.number).toBe(3);
    await markers.remove(m1.id);
    await markers.remove(m3.id);
    const m4 = await markers.create(visitId, { planId, page: 1, x: 0.5, y: 0.5 });
    expect(m4.number).toBe(4);
  });

  it("returns a snapshot time that follows every marker it lists and precedes later ones", async () => {
    const planId = await importPlan(USERS.alice);
    const visitId = await newVisit();
    const markers = serviceFor(USERS.alice).markers;
    const first = await markers.create(visitId, { planId, page: 1, x: 0.1, y: 0.1 });
    const snapshot = await markers.snapshotForVisit(visitId);
    expect(snapshot.markers.map((m) => m.id)).toEqual([first.id]);
    expect(Date.parse(snapshot.snapshotAt)).toBeGreaterThanOrEqual(Date.parse(first.updatedAt));
    const later = await markers.create(visitId, { planId, page: 1, x: 0.2, y: 0.2 });
    expect(Date.parse(later.updatedAt)).toBeGreaterThan(Date.parse(snapshot.snapshotAt));
  });

  it("gives distinct numbers to two writers creating at the same time", async () => {
    const planId = await importPlan(USERS.alice);
    const visitId = await newVisit();
    const created = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        serviceFor(USERS.alice).markers.create(visitId, { planId, page: 1, x: i / 10, y: 0.5 }),
      ),
    );
    expect(new Set(created.map((m) => m.number)).size).toBe(6);
    expect(created.map((m) => m.number).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("moves, renames, links and unlinks a photo; rounds coordinates to 5 decimals", async () => {
    const planId = await importPlan(USERS.alice);
    const visitId = await newVisit();
    const photoId = await readyPhoto(visitId);
    const markers = serviceFor(USERS.alice).markers;
    const marker = await markers.create(visitId, { planId, page: 1, x: 0.123456789, y: 1 });
    expect([marker.x, marker.y]).toEqual([0.12346, 1]);
    const moved = await markers.move(marker.id, 0, 0.5);
    expect([moved.x, moved.y]).toEqual([0, 0.5]);
    const linked = await markers.update(marker.id, { photoId, label: "Butoir" });
    expect(linked.photoId).toBe(photoId);
    expect(linked.photoThumbUrl).toContain(`${photoId}_thumb.jpg?`);
    expect(await markers.countWithoutPhoto(visitId)).toBe(0);
    expect(await markers.byPhotoIds([photoId])).toEqual({
      [photoId]: { markerId: marker.id, number: 1, planId, planName: "Plan de test", page: 1 },
    });
    // Deleting the photo leaves the marker without photo.
    await createPhotoService(USERS.alice, storage).remove(photoId);
    const [after] = await markers.listForVisit(visitId);
    expect(after?.photoId).toBeNull();
    expect(await markers.countWithoutPhoto(visitId)).toBe(1);
  });

  it("refuses a photo of another visit, a plan of another site and an archived plan", async () => {
    const planId = await importPlan(USERS.alice);
    const visitId = await newVisit();
    const otherVisit = await newVisit();
    const otherPhoto = await readyPhoto(otherVisit);
    const markers = serviceFor(USERS.alice).markers;
    await expect(
      markers.create(visitId, { planId, page: 1, x: 0.5, y: 0.5, photoId: otherPhoto }),
    ).rejects.toBeInstanceOf(ValidationError);
    const lillePlan = await importPlan(USERS.alice, SITE_LILLE);
    await expect(
      markers.create(visitId, { planId: lillePlan, page: 1, x: 0.5, y: 0.5 }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      markers.create(visitId, { planId, page: 9, x: 0.5, y: 0.5 }),
    ).rejects.toBeInstanceOf(ValidationError);
    const existing = await markers.create(visitId, { planId, page: 1, x: 0.5, y: 0.5 });
    await serviceFor(USERS.alice).setArchived(planId, true);
    await expect(
      markers.create(visitId, { planId, page: 1, x: 0.5, y: 0.5 }),
    ).rejects.toBeInstanceOf(ValidationError);
    // Existing markers stay editable on an archived plan, and the plan stays offered in this visit.
    expect((await markers.update(existing.id, { label: "Toujours là" })).label).toBe("Toujours là");
    const offered = await serviceFor(USERS.alice).listForVisit(visitId, SITE_TOULOUSE);
    expect(offered.find((p) => p.id === planId)).toMatchObject({
      isArchived: true,
      markersCount: 1,
    });
  });

  it("refuses markers to Emma, Claire, and on a completed visit", async () => {
    const planId = await importPlan(USERS.alice);
    const visitId = await newVisit();
    for (const user of [USERS.emma, USERS.claire]) {
      await expect(
        serviceFor(user).markers.create(visitId, { planId, page: 1, x: 0.5, y: 0.5 }),
      ).rejects.toBeInstanceOf(ForbiddenError);
    }
    const marker = await serviceFor(USERS.alice).markers.create(visitId, {
      planId,
      page: 1,
      x: 0.5,
      y: 0.5,
    });
    await createVisitRepository(USERS.alice).complete(visitId);
    await expect(
      serviceFor(USERS.alice).markers.create(visitId, { planId, page: 1, x: 0.2, y: 0.2 }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(serviceFor(USERS.alice).markers.move(marker.id, 0.1, 0.1)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    // Reading stays possible for everyone.
    expect(await serviceFor(USERS.claire).markers.listForVisit(visitId)).toHaveLength(1);
  });
});
