import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { sql } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DEFAULT_REPORT_OPTIONS } from "@/lib/report/options";
import { runScheduledPurge } from "@/server/cron/purge";
import { withSystem } from "@/server/db/context";
import { getDb } from "@/server/db/kysely";
import { closePool } from "@/server/db/pool";
import { createPhotoService } from "@/server/photos/service";
import { createVisitRepository } from "@/server/repositories/visit-repository";
import { createReportService } from "@/server/reports/service";
import { LocalStorageService } from "@/server/storage/local";
import { serveLocalStorage } from "@/server/storage/local-route";
import { LOCAL_STORAGE_ROUTE } from "@/server/storage/local-signing";

const ALICE = { id: "00000000-0000-4000-8000-000000000001" };
const SITE_TOULOUSE = "10000000-0000-4000-8000-000000000004";
const SECRET = "integration-cron-secret-32-characters-0000";
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]);
const PDF = new TextEncoder().encode("%PDF-1.7\n% rapport fictif\n%%EOF\n");

let dir = "";
let storage: LocalStorageService;

beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "ronde-cron-"));
  storage = new LocalStorageService({ dir, secret: SECRET });
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
  await closePool();
});

async function put(target: { url: string; headers: Record<string, string> }, body: Uint8Array) {
  const request = new Request(`http://ronde.test${target.url}`, {
    method: "PUT",
    headers: target.headers,
    body: body as BodyInit,
  });
  const segments = new URL(request.url).pathname.slice(`${LOCAL_STORAGE_ROUTE}/`.length).split("/");
  expect((await serveLocalStorage(storage, SECRET, request, segments)).status).toBe(200);
}

const photo = {
  originalFilename: "IMG_0001.jpg",
  width: 1600,
  height: 1200,
  sizeBytes: 11,
  thumbSizeBytes: 11,
  takenAt: "2026-05-04T08:00:00.000Z",
  zoneKey: null,
};

describe("scheduled purge", () => {
  it("purges stale pending photos and reports with their files, keeps fresh ones, audits", async () => {
    const visits = createVisitRepository(ALICE);
    const { id: visitId } = await visits.create({
      siteId: SITE_TOULOUSE,
      type: "technical",
      reason: "periodic",
      title: "Purge planifiée",
      visitDate: "2026-11-05",
      subject: null,
      writerId: ALICE.id,
    });
    const photos = createPhotoService(ALICE, storage);
    const [stale, fresh] = await photos.prepare(visitId, [photo, photo]);
    await put(stale!.main, JPEG);
    await put(stale!.thumb, JPEG);
    const reports = createReportService(ALICE, storage);
    const report = await reports.start(visitId, DEFAULT_REPORT_OPTIONS);
    await put(await reports.uploadTarget(report.reportId, PDF.byteLength), PDF);

    await withSystem("test.backdate", async (trx) => {
      await trx
        .updateTable("photos")
        .set({ created_at: sql`now() - interval '2 days'` })
        .where("id", "=", stale!.photoId)
        .execute();
    });
    // A report row is frozen by its trigger: backdate it as the local superuser, triggers off.
    await getDb()
      .transaction()
      .execute(async (trx) => {
        await sql`set local session_replication_role = replica`.execute(trx);
        await trx
          .updateTable("reports")
          .set({ generated_at: sql`now() - interval '2 days'` })
          .where("id", "=", report.reportId)
          .execute();
      });

    const summary = await runScheduledPurge(storage);
    expect(summary.photos).toBeGreaterThanOrEqual(1);
    expect(summary.reports).toBeGreaterThanOrEqual(1);
    expect(summary.objectFailures).toBe(0);

    const remaining = await withSystem("test.remaining", async (trx) => ({
      photos: await trx.selectFrom("photos").select("id").where("visit_id", "=", visitId).execute(),
      reports: await trx
        .selectFrom("reports")
        .select("id")
        .where("visit_id", "=", visitId)
        .execute(),
    }));
    expect(remaining.photos.map((row) => row.id)).toEqual([fresh!.photoId]);
    expect(remaining.reports).toEqual([]);
    expect(await storage.stat("visit-photos", `${visitId}/${stale!.photoId}.jpg`)).toBeNull();
    expect(await storage.stat("visit-photos", `${visitId}/${stale!.photoId}_thumb.jpg`)).toBeNull();
    expect(await storage.stat("reports", `${visitId}/${report.reportId}.pdf`)).toBeNull();

    const audit = await withSystem("test.audit", (trx) =>
      trx
        .selectFrom("audit_log")
        .select(["actor_id", "details"])
        .where("action", "=", "system.purge")
        .orderBy("occurred_at", "desc")
        .limit(1)
        .executeTakeFirstOrThrow(),
    );
    expect(audit.actor_id).toBeNull();
    expect(audit.details).toMatchObject({ photos: summary.photos, reports: summary.reports });
  });
});
