import { afterAll, describe, expect, it } from "vitest";

import { closePool } from "@/server/db/pool";
import { ConflictError, ForbiddenError, ValidationError } from "@/server/errors";
import { createVisitRepository } from "@/server/repositories/visit-repository";
import {
  createZoneNoteRepository,
  REMOVE_NOT_EMPTY,
  ZoneNoteConflictError,
} from "@/server/repositories/zone-note-repository";

const USERS = {
  alice: { id: "00000000-0000-4000-8000-000000000001" },
  bruno: { id: "00000000-0000-4000-8000-000000000002" },
  claire: { id: "00000000-0000-4000-8000-000000000003" },
  emma: { id: "00000000-0000-4000-8000-000000000006" },
};
const SITE_TOULOUSE = "10000000-0000-4000-8000-000000000004";
const V1 = "20000000-0000-4000-8000-000000000001";
const V2_COMPLETED = "20000000-0000-4000-8000-000000000002";
const NOTE_ROOF_V1 = "40000000-0000-4000-8000-000000000001";

const TECHNICAL_KEYS = [
  "roof",
  "docks",
  "sprinkler",
  "facades",
  "smoke_extraction",
  "electrical",
  "fences_access",
  "drainage",
  "fire_safety",
];

async function newVisit(type: "technical" | "meeting" = "technical") {
  const visits = createVisitRepository(USERS.alice);
  const { id } = await visits.create({
    siteId: SITE_TOULOUSE,
    type,
    reason: type === "meeting" ? "meeting" : "periodic",
    title: `Notes ${type}`,
    visitDate: "2026-11-02",
    subject: null,
    writerId: USERS.alice.id,
  });
  const detail = await visits.getById(id);
  return { id, version: detail!.version };
}

afterAll(async () => {
  await closePool();
});

describe("template at creation", () => {
  it("gives a technical visit the nine zones, in order, with empty content, in one version bump", async () => {
    const { id, version } = await newVisit("technical");
    const notes = await createZoneNoteRepository(USERS.alice).list(id);
    expect(notes.map((n) => n.zoneKey)).toEqual(TECHNICAL_KEYS);
    expect(notes.map((n) => n.sortOrder)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(notes.every((n) => n.content === "" && n.version === 1)).toBe(true);
    expect(notes[0]?.zoneLabel).toBe("Toiture");
    expect(version).toBe(2);
  });

  it("gives a meeting the provisional agenda / discussion / decisions zones", async () => {
    const { id } = await newVisit("meeting");
    const notes = await createZoneNoteRepository(USERS.alice).list(id);
    expect(notes.map((n) => n.zoneKey)).toEqual(["agenda", "discussion", "decisions"]);
    expect(notes.map((n) => n.zoneLabel)).toEqual([
      "Ordre du jour",
      "Points abordés",
      "Décisions et suites à donner",
    ]);
  });

  it("inserts the template without duplicate when called again, even after a removal", async () => {
    const { id, version } = await newVisit("technical");
    const repo = createZoneNoteRepository(USERS.alice);
    const again = await repo.insertTemplate(id, version, "technical");
    expect(again.notes).toHaveLength(9);
    expect(again.version).toBe(version);
    const docks = again.notes.find((n) => n.zoneKey === "docks")!;
    const removed = await repo.remove(docks.id, again.version);
    expect(removed.notes.map((n) => n.zoneKey)).not.toContain("docks");
    const restored = await repo.insertTemplate(id, removed.version, "technical");
    expect(restored.notes).toHaveLength(9);
    expect(restored.notes.at(-1)?.zoneKey).toBe("docks");
    expect(restored.version).toBe(removed.version + 1);
  });
});

describe("content and versions", () => {
  it("saves with the current note version, then reports the conflict with the current state", async () => {
    const { id } = await newVisit();
    const alice = createZoneNoteRepository(USERS.alice);
    const roof = (await alice.list(id)).find((n) => n.zoneKey === "roof")!;
    const first = await alice.updateContent(roof.id, 1, "Étanchéité correcte.");
    expect(first.version).toBe(2);

    const error = await alice.updateContent(roof.id, 1, "Texte obsolète").catch((e) => e);
    expect(error).toBeInstanceOf(ZoneNoteConflictError);
    expect(error).toBeInstanceOf(ConflictError);
    expect((error as ZoneNoteConflictError).current).toMatchObject({
      content: "Étanchéité correcte.",
      version: 2,
      updatedByName: "Alice Fictive",
    });
    expect((error as Error).message).toMatch(/Alice Fictive a modifié cette zone/);
  });

  it("does not bump the visit version on a content change, but does on structure changes", async () => {
    const { id, version } = await newVisit();
    const repo = createZoneNoteRepository(USERS.alice);
    const visits = createVisitRepository(USERS.alice);
    const notes = await repo.list(id);
    await repo.updateContent(notes[0]!.id, 1, "Contenu");
    await repo.updateContent(notes[1]!.id, 1, "Autre contenu");
    expect((await visits.getById(id))?.version).toBe(version);

    const added = await repo.addZone(id, version, { label: "Local sprinkler" });
    expect(added.version).toBe(version + 1);
    expect(added.notes.at(-1)).toMatchObject({ zoneLabel: "Local sprinkler", content: "" });
    expect(added.notes.at(-1)?.zoneKey).toMatch(/^custom-local-sprinkler-[a-z0-9]{4}$/);

    const renamed = await repo.rename(added.id, added.version, "Local sprinkler (RDC)");
    expect(renamed.version).toBe(added.version + 1);
    expect(renamed.notes.at(-1)?.zoneKey).toBe(added.notes.at(-1)?.zoneKey);

    const ids = renamed.notes.map((n) => n.id);
    const reordered = await repo.reorder(id, renamed.version, [ids.at(-1)!, ...ids.slice(0, -1)]);
    expect(reordered.version).toBe(renamed.version + 1);
    expect(reordered.notes[0]?.zoneLabel).toBe("Local sprinkler (RDC)");
    expect(reordered.notes.map((n) => n.sortOrder)).toEqual([...ids.keys()]);

    // The visit-level version is checked on every structure change.
    await expect(repo.rename(added.id, renamed.version, "Obsolète")).rejects.toThrow(
      /modifiée entre-temps/,
    );
  });

  it("validates the label: empty, too long, duplicated (normalised)", async () => {
    const { id, version } = await newVisit();
    const repo = createZoneNoteRepository(USERS.alice);
    await expect(repo.addZone(id, version, { label: "   " })).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(repo.addZone(id, version, { label: "x".repeat(81) })).rejects.toThrow(
      /80 caractères/,
    );
    await expect(repo.addZone(id, version, { label: "  toiture " })).rejects.toThrow(
      /porte déjà ce libellé/,
    );
    await expect(repo.addZone(id, version, { label: "Électricité et tgbt" })).rejects.toThrow(
      /porte déjà ce libellé/,
    );
    expect((await repo.list(id)).length).toBe(9);
  });

  it("refuses to remove a zone that is not empty, and removes an emptied one", async () => {
    const { id, version } = await newVisit();
    const repo = createZoneNoteRepository(USERS.alice);
    const docks = (await repo.list(id)).find((n) => n.zoneKey === "docks")!;
    const saved = await repo.updateContent(docks.id, 1, "Quai 14 : butoir arraché");
    await expect(repo.remove(docks.id, version)).rejects.toThrow(REMOVE_NOT_EMPTY);
    await repo.updateContent(docks.id, saved.version, "   ");
    const removed = await repo.remove(docks.id, version);
    expect(removed.notes.map((n) => n.zoneKey)).not.toContain("docks");
    const back = await repo.addTemplateZone(id, removed.version, "docks");
    expect(back.notes.at(-1)).toMatchObject({ zoneKey: "docks", zoneLabel: "Quais" });
    await expect(repo.addTemplateZone(id, back.version, "docks")).rejects.toThrow(/déjà présente/);
    await expect(repo.addTemplateZone(id, back.version, "agenda")).rejects.toThrow(
      /ne fait pas partie de la trame/,
    );
  });
});

describe("duplication", () => {
  it("copies the zone structure with empty content, in the same order", async () => {
    const { id, version } = await newVisit();
    const repo = createZoneNoteRepository(USERS.alice);
    const roof = (await repo.list(id))[0]!;
    await repo.updateContent(roof.id, 1, "Texte à ne pas copier");
    const added = await repo.addZone(id, version, { label: "Parking PL" });
    const ids = added.notes.map((n) => n.id);
    await repo.reorder(id, added.version, [ids.at(-1)!, ...ids.slice(0, -1)]);

    const copy = await createVisitRepository(USERS.alice).duplicate(id);
    const copied = await repo.list(copy.id);
    const source = await repo.list(id);
    expect(copied.map((n) => [n.zoneKey, n.zoneLabel])).toEqual(
      source.map((n) => [n.zoneKey, n.zoneLabel]),
    );
    expect(copied[0]?.zoneLabel).toBe("Parking PL");
    expect(copied.every((n) => n.content === "" && n.version === 1)).toBe(true);
  });
});

describe("access", () => {
  it("lets Bruno (participant of V1) write, refuses Emma and Claire, and refuses a completed visit", async () => {
    const roof = (await createZoneNoteRepository(USERS.bruno).list(V1)).find(
      (n) => n.id === NOTE_ROOF_V1,
    )!;
    const saved = await createZoneNoteRepository(USERS.bruno).updateContent(
      roof.id,
      roof.version,
      `${roof.content}\n- Lanterneau 3 nettoyé`,
    );
    expect(saved.version).toBe(roof.version + 1);
    await expect(
      createZoneNoteRepository(USERS.emma).updateContent(roof.id, saved.version, "Pirate"),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      createZoneNoteRepository(USERS.claire).updateContent(roof.id, saved.version, "Pirate"),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect((await createZoneNoteRepository(USERS.claire).list(V1)).length).toBeGreaterThan(0);

    const completed = (await createZoneNoteRepository(USERS.bruno).list(V2_COMPLETED))[0]!;
    await expect(
      createZoneNoteRepository(USERS.bruno).updateContent(
        completed.id,
        completed.version,
        "Trop tard",
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("exposes the zone counters in the visit summaries", async () => {
    const { id, version } = await newVisit();
    const repo = createZoneNoteRepository(USERS.alice);
    const notes = await repo.list(id);
    await repo.updateContent(notes[0]!.id, 1, "Un");
    await repo.updateContent(notes[1]!.id, 1, "Deux");
    await repo.updateContent(notes[2]!.id, 1, "   ");
    await repo.addZone(id, version, { label: "Dixième" });
    const page = await createVisitRepository(USERS.alice).list({
      scope: "mine",
      q: "Notes technical",
    });
    const summary = page.items.find((v) => v.id === id);
    expect(summary).toMatchObject({ zonesCount: 10, filledZonesCount: 2 });
  });
});
