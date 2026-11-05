import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DEFAULT_REPORT_OPTIONS } from "@/lib/report/options";
import { closePool } from "@/server/db/pool";
import { ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { createVisitRepository } from "@/server/repositories/visit-repository";
import {
  createReportService,
  REPORT_MAX_BYTES,
  type ReportService,
} from "@/server/reports/service";
import { LocalStorageService } from "@/server/storage/local";
import { serveLocalStorage } from "@/server/storage/local-route";
import { LOCAL_STORAGE_ROUTE } from "@/server/storage/local-signing";

const USERS = {
  alice: { id: "00000000-0000-4000-8000-000000000001" },
  claire: { id: "00000000-0000-4000-8000-000000000003" },
  david: { id: "00000000-0000-4000-8000-000000000004" },
  inactif: { id: "00000000-0000-4000-8000-000000000005" },
  emma: { id: "00000000-0000-4000-8000-000000000006" },
};
const V1 = "20000000-0000-4000-8000-000000000001";
const V2 = "20000000-0000-4000-8000-000000000002";
const SITE_TOULOUSE = "10000000-0000-4000-8000-000000000004";
const SECRET = "integration-reports-secret-32-characters-000";
const PDF = new TextEncoder().encode("%PDF-1.7\n% rapport fictif\n%%EOF\n");

let dir = "";
let storage: LocalStorageService;

function serviceFor(user: { id: string }): ReportService {
  return createReportService(user, storage);
}

async function put(target: { url: string; headers: Record<string, string> }, body: Uint8Array) {
  const request = new Request(`http://ronde.test${target.url}`, {
    method: "PUT",
    headers: target.headers,
    body: body as BodyInit,
  });
  const segments = new URL(request.url).pathname.slice(`${LOCAL_STORAGE_ROUTE}/`.length).split("/");
  return serveLocalStorage(storage, SECRET, request, segments);
}

/** Starts, uploads and confirms a report; returns the started report and the confirmation. */
async function generate(user: { id: string }, visitId: string) {
  const service = serviceFor(user);
  const started = await service.start(visitId, DEFAULT_REPORT_OPTIONS);
  const target = await service.uploadTarget(started.reportId, PDF.byteLength);
  expect((await put(target, PDF)).status).toBe(200);
  const confirmed = await service.confirm(started.reportId, PDF.byteLength, 2);
  return { started, confirmed };
}

beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "ronde-reports-"));
  storage = new LocalStorageService({ dir, secret: SECRET });
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
  await closePool();
});

describe("report data", () => {
  it("reads the frozen data of the seed visit, without any e-mail address", async () => {
    const data = await serviceFor(USERS.claire).getData(V1);
    expect(data.visit.site.code).toBe("TEST-001");
    expect(data.visit.writerName).toBe("Alice Fictive");
    expect(data.participants.length).toBeGreaterThanOrEqual(3);
    expect(data.zones.map((zone) => zone.key)).toContain("docks");
    const r4 = data.reserves.find((reserve) => reserve.code === "R-04");
    expect(r4?.isOverdue).toBe(true);
    const external = data.reserves.find((reserve) => reserve.responsibleKind === "external");
    expect(external).toMatchObject({
      responsibleName: "Marc Imaginaire",
      responsibleCompany: "Maintenance Fictive SAS",
    });
    expect(JSON.stringify(data)).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
    expect(data.plans[0]?.markers.length).toBeGreaterThanOrEqual(1);
    expect(data.report.isDraft).toBe(true);
    expect(data.report.number).toBeGreaterThanOrEqual(1);
  });
});

describe("report generation", () => {
  it("reserves distinct numbers, uploads, confirms and lists the report", async () => {
    const { id: visitId } = await createVisitRepository(USERS.alice).create({
      siteId: SITE_TOULOUSE,
      type: "technical",
      reason: "periodic",
      title: "Visite rapport",
      visitDate: "2026-11-05",
      subject: null,
      writerId: USERS.alice.id,
    });
    const first = await generate(USERS.alice, visitId);
    const second = await generate(USERS.alice, visitId);
    expect(first.started.number).toBe(1);
    expect(second.started.number).toBe(2);
    expect(first.started.fileName).toBe("RONDE_TEST-004_2026-11-05_1.pdf");
    expect(first.started.data.report).toMatchObject({
      number: 1,
      isDraft: true,
      generatedByName: "Alice Fictive",
    });
    expect(first.confirmed.ok && first.confirmed.report).toMatchObject({
      number: 1,
      isDraft: true,
      pageCount: 2,
      sizeBytes: PDF.byteLength,
      generatedByName: "Alice Fictive",
    });
    const history = await serviceFor(USERS.emma).list(visitId);
    expect(history.map((report) => report.number)).toEqual([2, 1]);
    const download = await serviceFor(USERS.claire).downloadUrl(history[0]!.id);
    expect(download.visitId).toBe(visitId);
    expect(download.url).toContain("dl=RONDE_TEST-004_2026-11-05_2.pdf");

    // Completed visit: the next report is no longer a draft.
    await createVisitRepository(USERS.alice).complete(visitId);
    const final = await generate(USERS.alice, visitId);
    expect(final.confirmed.ok && final.confirmed.report.isDraft).toBe(false);
  });

  it("lets Claire (direction) and David generate; refuses an inactive account", async () => {
    for (const user of [USERS.claire, USERS.david]) {
      const { confirmed } = await generate(user, V2);
      expect(confirmed.ok).toBe(true);
    }
    await expect(
      serviceFor(USERS.inactif).start(V2, DEFAULT_REPORT_OPTIONS),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("refuses to confirm a missing or incomplete file, and someone else's report", async () => {
    const alice = serviceFor(USERS.alice);
    const started = await alice.start(V1, DEFAULT_REPORT_OPTIONS);
    const missing = await alice.confirm(started.reportId, PDF.byteLength, 1);
    expect(missing).toMatchObject({ ok: false, retryable: true });
    const target = await alice.uploadTarget(started.reportId, PDF.byteLength);
    await put(target, PDF);
    expect(await alice.confirm(started.reportId, PDF.byteLength + 1, 1)).toMatchObject({
      ok: false,
    });
    expect(await serviceFor(USERS.emma).confirm(started.reportId, PDF.byteLength, 1)).toMatchObject(
      { ok: false },
    );
    await expect(
      serviceFor(USERS.emma).uploadTarget(started.reportId, PDF.byteLength),
    ).rejects.toBeInstanceOf(NotFoundError);
    // Not listed while pending.
    expect((await serviceFor(USERS.claire).list(V1)).some((r) => r.id === started.reportId)).toBe(
      false,
    );
    expect(await alice.confirm(started.reportId, PDF.byteLength, 3)).toMatchObject({ ok: true });
    // Double confirmation answers with the report.
    expect(await alice.confirm(started.reportId, PDF.byteLength, 3)).toMatchObject({ ok: true });
  });

  it("refuses to store a report above 50 MB", async () => {
    const alice = serviceFor(USERS.alice);
    const started = await alice.start(V1, DEFAULT_REPORT_OPTIONS);
    await expect(alice.uploadTarget(started.reportId, REPORT_MAX_BYTES + 1)).rejects.toThrow(
      /Légère/,
    );
    await expect(alice.uploadTarget(started.reportId, 0)).rejects.toBeInstanceOf(ValidationError);
  });

  it("renews image URLs only for images of the visit", async () => {
    const data = await serviceFor(USERS.alice).getData(V1);
    const keys = [
      ...data.photos.map((photo) => photo.image.key),
      ...data.plans.flatMap((plan) => plan.pages.map((page) => page.image.key)),
      "photo:60000000-0000-4000-8000-0000000000ff",
    ];
    const urls = await serviceFor(USERS.alice).renewImageUrls(V1, keys);
    expect(Object.keys(urls)).not.toContain("photo:60000000-0000-4000-8000-0000000000ff");
    for (const key of Object.keys(urls)) expect(keys).toContain(key);
    await expect(
      serviceFor(USERS.alice).downloadUrl("90000000-0000-4000-8000-0000000000ff"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
