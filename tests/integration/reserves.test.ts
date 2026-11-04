import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { todayInParis } from "@/lib/format";
import { addDays } from "@/lib/reserves/dates";
import { emptyReserveForm, type ReserveWrite, toReserveWrite } from "@/lib/reserves/schema";
import { withSystem } from "@/server/db/context";
import { closePool } from "@/server/db/pool";
import { ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { createPhotoService } from "@/server/photos/service";
import { createMarkerRepository } from "@/server/plans/repository";
import { createVisitRepository } from "@/server/repositories/visit-repository";
import { createReserveService, type ReserveService } from "@/server/reserves/service";
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
const SITE_LYON = "10000000-0000-4000-8000-000000000001";
const PLAN_LYON = "70000000-0000-4000-8000-000000000001";
const SECRET = "integration-reserves-secret-32-characters-00";
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0]);

let dir = "";
let storage: LocalStorageService;

function serviceFor(user: { id: string }): ReserveService {
  return createReserveService(user, storage);
}

function write(overrides: Partial<ReserveWrite> = {}): ReserveWrite {
  return {
    ...toReserveWrite({ ...emptyReserveForm(), action: "Remplacer les butoirs du quai 3" }),
    ...overrides,
  };
}

async function newVisit(user = USERS.alice, siteId = SITE_LYON) {
  const { id } = await createVisitRepository(user).create({
    siteId,
    type: "technical",
    reason: "periodic",
    title: "Réserves (test)",
    visitDate: todayInParis(),
    subject: null,
    writerId: user.id,
  });
  return id;
}

async function readyPhoto(visitId: string, user = USERS.alice): Promise<string> {
  const photos = createPhotoService(user, storage);
  const [prepared] = await photos.prepare(visitId, [
    {
      originalFilename: "defaut.jpg",
      width: 10,
      height: 10,
      sizeBytes: JPEG.byteLength,
      thumbSizeBytes: JPEG.byteLength,
      takenAt: null,
      zoneKey: null,
    },
  ]);
  for (const target of [prepared!.main, prepared!.thumb]) {
    const request = new Request(`http://ronde.test${target.url}`, {
      method: "PUT",
      headers: target.headers,
      body: JPEG as BodyInit,
    });
    const segments = new URL(request.url).pathname
      .slice(`${LOCAL_STORAGE_ROUTE}/`.length)
      .split("/");
    expect((await serveLocalStorage(storage, SECRET, request, segments)).status).toBe(200);
  }
  const confirmed = await photos.confirm(prepared!.photoId);
  if (!confirmed.ok) throw new Error(confirmed.error);
  return prepared!.photoId;
}

beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "ronde-reserves-"));
  storage = new LocalStorageService({ dir, secret: SECRET });
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
  await closePool();
});

describe("reserve creation and reading", () => {
  it("creates a reserve with a defect photo, readable by everyone, e-mail only in the detail", async () => {
    const visitId = await newVisit();
    const photoId = await readyPhoto(visitId);
    const created = await serviceFor(USERS.alice).create(
      visitId,
      write({
        priority: "urgent",
        zoneKey: "docks",
        dueDate: addDays(todayInParis(), 7),
        responsibleKind: "external",
        responsibleName: "Paul Fictif",
        responsibleCompany: "Portes Imaginaires SARL",
        responsibleEmail: "paul@example.test",
      }),
      [photoId],
    );
    expect(created.code).toMatch(/^R-\d{2,}$/);
    expect(created.version).toBe(1);
    expect(created.photosCount).toBe(1);
    expect(created.photos[0]?.id).toBe(photoId);
    expect(created.photos[0]?.thumbUrl).toContain(`/visit-photos/${visitId}/`);
    expect(created.firstThumbUrl).toContain(`/visit-photos/${visitId}/`);
    expect(created.responsibleLabel).toBe("Paul Fictif · Portes Imaginaires SARL");
    expect(created.responsibleEmail).toBe("paul@example.test");
    expect(created.zoneLabel).toBe("Quais");

    for (const reader of [USERS.claire, USERS.emma, USERS.bruno]) {
      const listed = await serviceFor(reader).listForVisit(visitId);
      const item = listed.find((reserve) => reserve.id === created.id);
      expect(item?.code).toBe(created.code);
      expect(item && "responsibleEmail" in item).toBe(false);
      expect(JSON.stringify(listed)).not.toContain("paul@example.test");
    }
    const detail = await serviceFor(USERS.claire).get(created.id);
    expect(detail.responsibleEmail).toBe("paul@example.test");
    expect(detail.visitTitle).toBe("Réserves (test)");
  });

  it("refuses a photo of another visit and keeps the reserve unsaved", async () => {
    const visitId = await newVisit();
    const otherVisit = await newVisit();
    const foreignPhoto = await readyPhoto(otherVisit);
    const before = (await serviceFor(USERS.alice).listForVisit(visitId)).length;
    await expect(
      serviceFor(USERS.alice).create(visitId, write(), [foreignPhoto]),
    ).rejects.toBeInstanceOf(ValidationError);
    expect((await serviceFor(USERS.alice).listForVisit(visitId)).length).toBe(before);
  });

  it("computes overdue days in Paris time: due today is on time, due yesterday is one day late", async () => {
    const visitId = await newVisit();
    const today = todayInParis();
    const service = serviceFor(USERS.alice);
    const dueToday = await service.create(visitId, write({ dueDate: today }), []);
    const dueYesterday = await service.create(visitId, write({ dueDate: addDays(today, -1) }), []);
    expect(dueToday.isOverdue).toBe(false);
    expect(dueToday.daysOverdue).toBe(0);
    expect(dueYesterday.isOverdue).toBe(true);
    expect(dueYesterday.daysOverdue).toBe(1);
    const done = await service.setStatus(dueYesterday.id, "done");
    expect(done.isOverdue).toBe(false);
  });
});

describe("rights", () => {
  it("lets only editors of an in-progress visit write (Emma, Claire refused; David allowed)", async () => {
    const visitId = await newVisit();
    const reserve = await serviceFor(USERS.alice).create(visitId, write(), []);
    await expect(serviceFor(USERS.emma).create(visitId, write(), [])).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(serviceFor(USERS.claire).create(visitId, write(), [])).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    const emmaUpdate = serviceFor(USERS.emma).update(reserve.id, write({ action: "x" }), 1);
    await expect(emmaUpdate).rejects.toBeInstanceOf(ForbiddenError);
    await expect(serviceFor(USERS.emma).setStatus(reserve.id, "done")).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(serviceFor(USERS.claire).softDelete(reserve.id)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    const byAdmin = await serviceFor(USERS.david).create(visitId, write(), []);
    expect(byAdmin.createdByName).toBe("David Fictif");
  });

  it("refuses every write once the visit is completed", async () => {
    const visitId = await newVisit();
    const reserve = await serviceFor(USERS.alice).create(visitId, write(), []);
    await createVisitRepository(USERS.alice).complete(visitId);
    const alice = serviceFor(USERS.alice);
    await expect(alice.create(visitId, write(), [])).rejects.toBeInstanceOf(ForbiddenError);
    await expect(alice.update(reserve.id, write({ action: "Autre" }), 1)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(alice.setStatus(reserve.id, "done")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(alice.softDelete(reserve.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      alice.placeOnPlan(reserve.id, { planId: PLAN_LYON, page: 1, x: 0.5, y: 0.5 }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    // Still readable.
    expect((await alice.get(reserve.id)).visitStatus).toBe("completed");
  });
});

describe("optimistic concurrency and history", () => {
  it("returns a conflict with the current reserve when the version is stale", async () => {
    const visitId = await newVisit();
    const service = serviceFor(USERS.alice);
    const reserve = await service.create(visitId, write(), []);
    const first = await service.update(reserve.id, write({ action: "Première tab" }), 1);
    expect(first.ok && first.reserve.version).toBe(2);
    const second = await service.update(reserve.id, write({ action: "Seconde tab" }), 1);
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.current.action).toBe("Première tab");
    expect(second.current.version).toBe(2);
    expect(second.message).toContain("Alice Fictive");
    // Nothing was lost: the saved value is still the first one.
    expect((await service.get(reserve.id)).action).toBe("Première tab");
  });

  it("records creation, edits and status changes; reopening clears the closing date", async () => {
    const visitId = await newVisit();
    const service = serviceFor(USERS.alice);
    const due = addDays(todayInParis(), 10);
    const reserve = await service.create(visitId, write({ dueDate: due }), []);
    const later = addDays(todayInParis(), 30);
    const updated = await service.update(
      reserve.id,
      write({ dueDate: later, responsibleKind: "internal", responsibleProfileId: USERS.bruno.id }),
      reserve.version,
    );
    expect(updated.ok).toBe(true);
    const done = await service.setStatus(reserve.id, "done");
    expect(done.closedAt).not.toBeNull();
    expect(done.closedByName).toBe("Alice Fictive");
    const reopened = await service.setStatus(reserve.id, "open");
    expect(reopened.closedAt).toBeNull();
    expect(reopened.closedByName).toBeNull();

    const history = await serviceFor(USERS.claire).history(reserve.id);
    expect(history.map((entry) => entry.type)).toEqual([
      "created",
      "updated",
      "status_changed",
      "status_changed",
    ]);
    expect(history[0]?.actorName).toBe("Alice Fictive");
    const changes = history[1]?.changes ?? [];
    expect(changes.find((c) => c.field === "due_date")).toMatchObject({
      label: "Échéance",
      from: due.split("-").reverse().join("/"),
      to: later.split("-").reverse().join("/"),
    });
    expect(changes.find((c) => c.field === "responsible")).toMatchObject({
      from: "À désigner",
      to: "Bruno Fictif",
    });
    expect(history[2]).toMatchObject({ fromStatus: "open", toStatus: "done" });
    expect(history[3]).toMatchObject({ fromStatus: "done", toStatus: "open" });
  });
});

describe("plan placement", () => {
  it("places, moves and removes the marker with the reserve; the reserve number is never reused", async () => {
    const visitId = await newVisit();
    const service = serviceFor(USERS.alice);
    const reserve = await service.create(visitId, write(), []);
    const marker = await service.placeOnPlan(reserve.id, {
      planId: PLAN_LYON,
      page: 1,
      x: 0.25,
      y: 0.75,
    });
    expect(marker.planId).toBe(PLAN_LYON);
    const moved = await service.placeOnPlan(reserve.id, {
      planId: PLAN_LYON,
      page: 2,
      x: 0.5,
      y: 0.5,
    });
    expect(moved.id).toBe(marker.id);
    expect(moved.page).toBe(2);
    expect((await service.get(reserve.id)).marker).toEqual(moved);

    const markers = createMarkerRepository(USERS.alice);
    const before = await markers.listForVisit(visitId);
    const reserveMarker = before.find((m) => m.id === marker.id);
    expect(reserveMarker).toBeDefined();

    await service.softDelete(reserve.id);
    await expect(service.get(reserve.id)).rejects.toBeInstanceOf(NotFoundError);
    const after = await markers.listForVisit(visitId);
    expect(after.some((m) => m.id === marker.id)).toBe(false);
    // The reserve number (R-07) is never given again: the deleted row keeps it.
    const next = await service.create(visitId, write(), []);
    expect(next.number).toBeGreaterThan(reserve.number);
  });

  it("refuses to place a deleted reserve and lets an editor take it off the plan", async () => {
    const visitId = await newVisit();
    const service = serviceFor(USERS.alice);
    const reserve = await service.create(visitId, write(), []);
    await service.placeOnPlan(reserve.id, { planId: PLAN_LYON, page: 1, x: 0.4, y: 0.4 });
    await service.removeFromPlan(reserve.id);
    expect((await service.get(reserve.id)).marker).toBeNull();
    await service.softDelete(reserve.id);
    await expect(
      service.placeOnPlan(reserve.id, { planId: PLAN_LYON, page: 1, x: 0.4, y: 0.4 }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("links, suggestions and counters", () => {
  it("links and unlinks photos, and finds the reserves of a photo", async () => {
    const visitId = await newVisit();
    const service = serviceFor(USERS.alice);
    const photoA = await readyPhoto(visitId);
    const photoB = await readyPhoto(visitId);
    const reserve = await service.create(visitId, write(), [photoA]);
    await service.linkPhotos(reserve.id, [photoB, photoA]);
    expect((await service.get(reserve.id)).photos.map((p) => p.id)).toEqual([photoA, photoB]);
    const links = await serviceFor(USERS.claire).byPhotoIds([photoA, photoB]);
    expect(links[photoA]).toEqual([{ reserveId: reserve.id, code: reserve.code }]);
    await service.unlinkPhoto(reserve.id, photoA);
    expect((await service.get(reserve.id)).photosCount).toBe(1);
  });

  it("counts reserves without responsible, without due date, urgent without photo", async () => {
    const visitId = await newVisit();
    const service = serviceFor(USERS.alice);
    await service.create(visitId, write({ priority: "urgent" }), []);
    await service.create(
      visitId,
      write({
        dueDate: addDays(todayInParis(), 3),
        responsibleKind: "internal",
        responsibleProfileId: USERS.alice.id,
      }),
      [],
    );
    const urgentWithPhoto = await service.create(visitId, write({ priority: "urgent" }), [
      await readyPhoto(visitId),
    ]);
    const counts = await service.incompleteCounts(visitId);
    expect(counts).toEqual({ withoutResponsible: 2, withoutDueDate: 2, urgentWithoutPhoto: 1 });
    await service.setStatus(urgentWithPhoto.id, "done");
    expect((await service.incompleteCounts(visitId)).withoutResponsible).toBe(1);
  });

  it("suggests active profiles and the external pairs used on the site, without e-mails", async () => {
    const visitId = await newVisit();
    const company = `Entreprise Test ${Date.now()}`;
    await serviceFor(USERS.alice).create(
      visitId,
      write({
        responsibleKind: "external",
        responsibleName: "Nina Fictive",
        responsibleCompany: company,
        responsibleEmail: "nina@example.test",
      }),
      [],
    );
    const suggestions = await serviceFor(USERS.alice).suggestions(SITE_LYON);
    expect(suggestions.external.length).toBeLessThanOrEqual(10);
    expect(suggestions.external[0]).toEqual({ company, name: "Nina Fictive" });
    expect(JSON.stringify(suggestions)).not.toContain("@");
    expect(suggestions.internal.some((p) => p.id === USERS.bruno.id)).toBe(true);
    expect(suggestions.internal.some((p) => p.id === USERS.inactif.id)).toBe(false);
  });

  it("shows an inactive internal responsible as such", async () => {
    const visitId = await newVisit();
    const reserve = await serviceFor(USERS.alice).create(
      visitId,
      write({ responsibleKind: "internal", responsibleProfileId: USERS.inactif.id }),
      [],
    );
    expect(reserve.responsibleInactive).toBe(true);
  });

  it("summarises the open reserves of a site for every reader", async () => {
    const visitId = await newVisit();
    const before = await serviceFor(USERS.claire).siteSummary(SITE_LYON);
    const reserve = await serviceFor(USERS.alice).create(
      visitId,
      write({ priority: "urgent", dueDate: addDays(todayInParis(), -2) }),
      [],
    );
    const after = await serviceFor(USERS.claire).siteSummary(SITE_LYON);
    expect(after.open).toBe(before.open + 1);
    expect(after.overdue).toBe(before.overdue + 1);
    expect(after.urgent).toBe(before.urgent + 1);
    expect(after.items.length).toBeLessThanOrEqual(10);
    const listed = after.items.find((item) => item.id === reserve.id);
    expect(listed?.visitTitle).toBe("Réserves (test)");
    expect(after.items[0]?.isOverdue).toBe(true);

    await serviceFor(USERS.alice).setStatus(reserve.id, "done");
    const closed = await serviceFor(USERS.claire).siteSummary(SITE_LYON);
    expect(closed.open).toBe(before.open);
  });

  it("serialises reserve numbers per site under concurrent creation", async () => {
    const visitId = await newVisit();
    const service = serviceFor(USERS.alice);
    const created = await Promise.all(
      Array.from({ length: 6 }, () => service.create(visitId, write(), [])),
    );
    const numbers = created.map((reserve) => reserve.number);
    expect(new Set(numbers).size).toBe(6);
    // The audit keeps a trace of every creation.
    const audited = await withSystem("test.audit", (trx) =>
      trx
        .selectFrom("audit_log")
        .select("entity_id")
        .where("action", "=", "reserve.created")
        .where(
          "entity_id",
          "in",
          created.map((reserve) => reserve.id),
        )
        .execute(),
    );
    expect(audited.length).toBe(6);
  });
});
