import { sql } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { todayInParis } from "@/lib/format";
import { withSystem } from "@/server/db/context";
import { closePool } from "@/server/db/pool";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { createParticipantRepository } from "@/server/repositories/participant-repository";
import { listAssignableProfiles } from "@/server/repositories/profile-repository";
import { createVisitRepository } from "@/server/repositories/visit-repository";

const USERS = {
  alice: { id: "00000000-0000-4000-8000-000000000001" },
  bruno: { id: "00000000-0000-4000-8000-000000000002" },
  claire: { id: "00000000-0000-4000-8000-000000000003" },
  david: { id: "00000000-0000-4000-8000-000000000004" },
  emma: { id: "00000000-0000-4000-8000-000000000006" },
};
const SITES = {
  lyon: "10000000-0000-4000-8000-000000000001",
  toulouse: "10000000-0000-4000-8000-000000000004",
  rouenInactive: "10000000-0000-4000-8000-000000000012",
};
const V1 = "20000000-0000-4000-8000-000000000001";
const V2_COMPLETED = "20000000-0000-4000-8000-000000000002";
const V3_DELETED = "20000000-0000-4000-8000-000000000003";

const input = (
  overrides: Partial<Parameters<ReturnType<typeof createVisitRepository>["create"]>[0]> = {},
) => ({
  siteId: SITES.toulouse,
  type: "technical" as const,
  reason: "periodic" as const,
  title: "Visite d'intégration",
  visitDate: "2026-11-02",
  subject: null,
  writerId: null,
  ...overrides,
});

async function auditActions(entityId: string): Promise<string[]> {
  return withSystem("test.audit", async (trx) => {
    const { rows } = await sql<{
      action: string;
    }>`select action from public.audit_log where entity_id = ${entityId}::uuid order by id`.execute(
      trx,
    );
    return rows.map((row) => row.action);
  });
}

afterAll(async () => {
  await closePool();
});

describe("creation", () => {
  it("lets Alice create a visit and refuses Claire", async () => {
    const { id } = await createVisitRepository(USERS.alice).create(
      input({ writerId: USERS.alice.id }),
    );
    const detail = await createVisitRepository(USERS.alice).getById(id);
    expect(detail).toMatchObject({
      title: "Visite d'intégration",
      status: "in_progress",
      createdBy: USERS.alice.id,
      // 1 at insert, +1 when the zone template is inserted (one statement, step 6).
      version: 2,
    });
    expect(detail?.permissions).toEqual({ canEdit: true, canManage: true });
    expect(await auditActions(id)).toEqual(["visit.created"]);
    await expect(createVisitRepository(USERS.claire).create(input())).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("refuses an inactive or unknown site with a clear message", async () => {
    // The e2e site import reactivates TEST-012: put back its seed state first (as postgres).
    await withSystem("test.inactive_site", (trx) =>
      sql`update public.sites set is_active = false where id = ${SITES.rouenInactive}`.execute(trx),
    );
    await expect(
      createVisitRepository(USERS.alice).create(input({ siteId: SITES.rouenInactive })),
    ).rejects.toThrow(/inactif ou inconnu/);
    await expect(
      createVisitRepository(USERS.alice).create(
        input({ siteId: "00000000-0000-4000-8000-00000000dead" }),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("optimistic update", () => {
  it("updates with the current version, then rejects the stale one naming the last writer", async () => {
    const repo = createVisitRepository(USERS.alice);
    const { id } = await repo.create(input());
    const patch = {
      type: "technical" as const,
      reason: "post_claim" as const,
      title: "Modifiée",
      visitDate: "2026-11-03",
      subject: "Objet",
      writerId: USERS.bruno.id,
    };
    const first = await repo.update(id, 2, patch);
    expect(first.version).toBe(3);
    await expect(repo.update(id, 1, { ...patch, title: "Obsolète" })).rejects.toThrow(
      /modifiée entre-temps par Alice Fictive/,
    );
    const detail = await repo.getById(id);
    expect(detail?.title).toBe("Modifiée");
    expect(detail?.updatedByName).toBe("Alice Fictive");
  });

  it("refuses an update by a user who may not edit, and on a completed visit", async () => {
    const detail = await createVisitRepository(USERS.alice).getById(V1);
    const patch = {
      type: "technical" as const,
      reason: "periodic" as const,
      title: "Piratée",
      visitDate: "2026-11-02",
      subject: null,
      writerId: null,
    };
    await expect(
      createVisitRepository(USERS.emma).update(V1, detail!.version, patch),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      createVisitRepository(USERS.claire).update(V1, detail!.version, patch),
    ).rejects.toBeInstanceOf(ForbiddenError);
    const completed = await createVisitRepository(USERS.bruno).getById(V2_COMPLETED);
    expect(completed?.permissions.canEdit).toBe(false);
    await expect(
      createVisitRepository(USERS.bruno).update(V2_COMPLETED, completed!.version, patch),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("participants", () => {
  it("adds, rejects a duplicated profile, reorders and bumps the visit version; a linked colleague gains editing", async () => {
    const visits = createVisitRepository(USERS.alice);
    const participants = createParticipantRepository(USERS.alice);
    const { id } = await visits.create(input());

    const added = await participants.add(id, 2, {
      profileId: USERS.emma.id,
      fullName: "Emma Fictive",
      company: null,
      jobTitle: null,
      email: null,
      isPresent: true,
      sortOrder: 0,
    });
    expect(added.version).toBe(3);
    await expect(
      participants.add(id, 3, {
        profileId: USERS.emma.id,
        fullName: "Emma encore",
        company: null,
        jobTitle: null,
        email: null,
        isPresent: true,
        sortOrder: 1,
      }),
    ).rejects.toThrow(/participe déjà/);
    const external = await participants.add(id, 3, {
      profileId: null,
      fullName: "Marc Imaginaire",
      company: "Maintenance Fictive SAS",
      jobTitle: null,
      email: "marc@example.test",
      isPresent: true,
      sortOrder: 1,
    });
    expect(external.version).toBe(4);

    const list = await participants.list(id);
    expect(list.map((p) => p.fullName)).toEqual(["Emma Fictive", "Marc Imaginaire"]);
    // Each changed participant row bumps the version (two rows swapped here).
    const reordered = await participants.reorder(id, 4, [external.id, added.id]);
    expect(reordered.version).toBeGreaterThan(4);
    expect((await participants.list(id)).map((p) => p.fullName)).toEqual([
      "Marc Imaginaire",
      "Emma Fictive",
    ]);

    await expect(participants.remove(id, 3, external.id)).rejects.toBeInstanceOf(ConflictError);
    const removed = await participants.remove(id, reordered.version, external.id);
    expect(removed.version).toBe(reordered.version + 1);
    const flipped = await participants.update(id, removed.version, added.id, { isPresent: false });
    expect(flipped.version).toBe(removed.version + 1);
    expect((await participants.list(id))[0]?.isPresent).toBe(false);

    // Emma, now linked, may edit the visit.
    const asEmma = await createVisitRepository(USERS.emma).getById(id);
    expect(asEmma?.permissions).toEqual({ canEdit: true, canManage: false });
    const saved = await createVisitRepository(USERS.emma).update(id, flipped.version, {
      type: "technical",
      reason: "periodic",
      title: "Par Emma",
      visitDate: "2026-11-02",
      subject: null,
      writerId: null,
    });
    expect(saved.version).toBe(flipped.version + 1);
  });
});

describe("duplication", () => {
  it("copies exactly type, reason, subject, writer, title (suite) and participants set to present", async () => {
    const visits = createVisitRepository(USERS.alice);
    const participants = createParticipantRepository(USERS.alice);
    const { id } = await visits.create(
      input({
        reason: "tenant_exit",
        subject: "Objet repris",
        writerId: USERS.bruno.id,
        title: "Sortie",
      }),
    );
    await participants.add(id, 2, {
      profileId: USERS.bruno.id,
      fullName: "Bruno Fictif",
      company: null,
      jobTitle: null,
      email: null,
      isPresent: false,
      sortOrder: 0,
    });
    await participants.add(id, 3, {
      profileId: null,
      fullName: "Externe",
      company: "Soc",
      jobTitle: "Chef",
      email: null,
      isPresent: true,
      sortOrder: 1,
    });

    const copy = await visits.duplicate(id);
    const detail = await visits.getById(copy.id);
    expect(detail).toMatchObject({
      siteId: SITES.toulouse,
      type: "technical",
      reason: "tenant_exit",
      subject: "Objet repris",
      writerId: USERS.bruno.id,
      title: "Sortie (suite)",
      visitDate: todayInParis(),
      status: "in_progress",
      duplicatedFromId: id,
    });
    const copied = await participants.list(copy.id);
    expect(copied.map((p) => [p.fullName, p.isPresent, p.profileId])).toEqual([
      ["Bruno Fictif", true, USERS.bruno.id],
      ["Externe", true, null],
    ]);
    await expect(createVisitRepository(USERS.claire).duplicate(id)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});

describe("lifecycle", () => {
  it("completes, reopens and soft-deletes according to roles, with audit entries", async () => {
    const visits = createVisitRepository(USERS.alice);
    const { id } = await visits.create(input({ writerId: USERS.alice.id }));
    await createParticipantRepository(USERS.alice).add(id, 2, {
      profileId: USERS.bruno.id,
      fullName: "Bruno Fictif",
      company: null,
      jobTitle: null,
      email: null,
      isPresent: true,
      sortOrder: 0,
    });

    await expect(createVisitRepository(USERS.emma).complete(id)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await createVisitRepository(USERS.bruno).complete(id); // participant may complete
    expect((await visits.getById(id))?.status).toBe("completed");
    expect((await visits.getById(id))?.permissions).toEqual({ canEdit: false, canManage: true });

    await expect(createVisitRepository(USERS.bruno).reopen(id)).rejects.toBeInstanceOf(
      ForbiddenError,
    ); // participant may not reopen
    await visits.reopen(id);
    expect((await visits.getById(id))?.status).toBe("in_progress");

    await expect(createVisitRepository(USERS.bruno).softDelete(id)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await visits.softDelete(id);
    expect(await visits.getById(id)).toBeNull();
    const asDavid = await createVisitRepository(USERS.david).getById(id);
    expect(asDavid?.deletedAt).not.toBeNull();
    expect(asDavid?.deletedByName).toBe("Alice Fictive");
    expect(await auditActions(id)).toEqual([
      "visit.created",
      "visit.completed",
      "visit.reopened",
      "visit.deleted",
    ]);
  });
});

const RUN = `run${Date.now()}`;

describe("list", () => {
  beforeAll(async () => {
    const repo = createVisitRepository(USERS.alice);
    for (let index = 0; index < 22; index += 1) {
      await repo.create(
        input({
          title: `Pagination ${RUN} ${index}`,
          visitDate: `2025-01-${String((index % 28) + 1).padStart(2, "0")}`,
          reason: index % 2 ? "post_claim" : "periodic",
        }),
      );
    }
  });

  it("scopes to mine for the creator, writer and linked participant", async () => {
    // Other test files commit visits for Alice: look through every page, not only the first.
    async function mineIds(user: { id: string }): Promise<string[]> {
      const repo = createVisitRepository(user);
      const first = await repo.list({ scope: "mine" });
      const ids = first.items.map((v) => v.id);
      for (let page = 2; page <= first.pageCount; page += 1) {
        ids.push(...(await repo.list({ scope: "mine", page })).items.map((v) => v.id));
      }
      return ids;
    }
    expect(await mineIds(USERS.alice)).toContain(V1);
    const mineBruno = await mineIds(USERS.bruno);
    expect(mineBruno).toContain(V1); // participant
    expect(mineBruno).toContain(V2_COMPLETED); // creator
    const mineEmma = await createVisitRepository(USERS.emma).list({ scope: "mine", q: "Lyon Sud" });
    expect(mineEmma.items.some((v) => v.id === V1)).toBe(false);
    const all = await createVisitRepository(USERS.claire).list({ scope: "all" });
    expect(all.total).toBeGreaterThan(22);
    expect(all.items.some((v) => v.id === V3_DELETED)).toBe(false);
  });

  it("filters, searches without accents and paginates by 20", async () => {
    const repo = createVisitRepository(USERS.alice);
    const page1 = await repo.list({ scope: "mine", q: RUN });
    expect(page1.items).toHaveLength(20);
    expect(page1.total).toBe(22);
    expect(page1.pageCount).toBe(2);
    const page2 = await repo.list({ scope: "mine", q: RUN, page: 2 });
    expect(page2.items).toHaveLength(2);
    expect(page1.items[0]!.visitDate >= page1.items[19]!.visitDate).toBe(true);

    const claims = await repo.list({
      scope: "mine",
      q: RUN.toUpperCase(),
      reason: "post_claim",
      from: "2025-01-01",
      to: "2025-01-10",
    });
    expect(
      claims.items.every((v) => v.reason === "post_claim" && v.visitDate <= "2025-01-10"),
    ).toBe(true);
    expect(claims.total).toBe(5);
    const completed = await repo.list({ scope: "all", status: "completed", q: "lille" });
    expect(completed.items.some((v) => v.id === V2_COMPLETED)).toBe(true);
    const bySite = await repo.list({ scope: "all", siteId: SITES.lyon, q: "lyon" });
    expect(bySite.items.every((v) => v.siteId === SITES.lyon)).toBe(true);
    const accentless = await repo.list({ scope: "all", q: "periodique lyon" });
    expect(accentless.items.some((v) => v.id === V1)).toBe(true);
  });
});

describe("permissions", () => {
  it("are computed for every seeded role on V1", async () => {
    const expected = {
      alice: { canEdit: true, canManage: true },
      bruno: { canEdit: true, canManage: false },
      emma: { canEdit: false, canManage: false },
      claire: { canEdit: false, canManage: false },
      david: { canEdit: true, canManage: true },
    } as const;
    for (const [name, user] of Object.entries(USERS)) {
      const detail = await createVisitRepository(user).getById(V1);
      expect(detail?.permissions, name).toEqual(expected[name as keyof typeof expected]);
    }
    expect(await createVisitRepository(USERS.alice).getById(V3_DELETED)).toBeNull();
    await expect(
      createVisitRepository(USERS.alice).update("00000000-0000-4000-8000-00000000dead", 1, {
        type: "technical",
        reason: "periodic",
        title: "x",
        visitDate: "2026-01-01",
        subject: null,
        writerId: null,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("lists assignable profiles: active rt and admin only", async () => {
    const names = (await listAssignableProfiles(USERS.claire)).map((p) => p.fullName);
    expect(names).toEqual(
      expect.arrayContaining(["Alice Fictive", "Bruno Fictif", "David Fictif", "Emma Fictive"]),
    );
    expect(names).not.toContain("Claire Fictive");
    expect(names).not.toContain("Inactif Fictif");
  });
});
