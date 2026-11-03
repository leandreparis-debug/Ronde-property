import { sql } from "kysely";
import { afterAll, describe, expect, it } from "vitest";

import { closePool } from "@/server/db/pool";
import { withSystem, withUser } from "@/server/db/context";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnexpectedError,
  ValidationError,
} from "@/server/errors";

const USERS = {
  alice: "00000000-0000-4000-8000-000000000001",
  emma: "00000000-0000-4000-8000-000000000006",
  claire: "00000000-0000-4000-8000-000000000003",
  david: "00000000-0000-4000-8000-000000000004",
};
const V1 = "20000000-0000-4000-8000-000000000001";
const SITE_LYON = "10000000-0000-4000-8000-000000000001";

afterAll(async () => {
  await closePool();
});

describe("withUser reproduces the RLS of step 2", () => {
  it("lets Alice (creator) update V1 and bumps its version", async () => {
    const before = await withUser({ id: USERS.alice }, (trx) =>
      trx.selectFrom("visits").select("version").where("id", "=", V1).executeTakeFirstOrThrow(),
    );
    const result = await withUser({ id: USERS.alice }, async (trx) => {
      const updated = await trx
        .updateTable("visits")
        .set({ subject: "Objet modifié via withUser" })
        .where("id", "=", V1)
        .executeTakeFirst();
      const row = await trx
        .selectFrom("visits")
        .select(["version", "subject"])
        .where("id", "=", V1)
        .executeTakeFirstOrThrow();
      // Keep the seed intact for the other tests.
      await sql`select 1`.execute(trx);
      return { updated: Number(updated.numUpdatedRows), row };
    });
    expect(result.updated).toBe(1);
    expect(result.row.version).toBe(before.version + 1);
    // Restore the subject (as Alice, which is allowed).
    await withUser({ id: USERS.alice }, (trx) =>
      trx
        .updateTable("visits")
        .set({ subject: "Contrôle semestriel des quais et de la toiture." })
        .where("id", "=", V1)
        .execute(),
    );
  });

  it("prevents Emma (not involved) from updating V1: zero row touched", async () => {
    const updated = await withUser({ id: USERS.emma }, (trx) =>
      trx
        .updateTable("visits")
        .set({ subject: "Tentative" })
        .where("id", "=", V1)
        .executeTakeFirst(),
    );
    expect(Number(updated.numUpdatedRows)).toBe(0);
  });

  it("lets Claire (direction) read but raises ForbiddenError on insert", async () => {
    const visits = await withUser({ id: USERS.claire }, (trx) =>
      trx.selectFrom("visit_summaries").select(["id", "title"]).execute(),
    );
    expect(visits.length).toBeGreaterThanOrEqual(2);

    await expect(
      withUser({ id: USERS.claire }, (trx) =>
        trx
          .insertInto("visits")
          .values({
            site_id: SITE_LYON,
            title: "Interdit",
            visit_date: "2026-11-02",
            created_by: USERS.claire,
          })
          .execute(),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("lets David (admin) see the deleted visit, hidden from Alice", async () => {
    const forDavid = await withUser({ id: USERS.david }, (trx) =>
      trx.selectFrom("visits").select("id").where("deleted_at", "is not", null).execute(),
    );
    expect(forDavid.length).toBeGreaterThanOrEqual(1);
    const forAlice = await withUser({ id: USERS.alice }, (trx) =>
      trx.selectFrom("visits").select("id").where("deleted_at", "is not", null).execute(),
    );
    expect(forAlice).toHaveLength(0);
  });

  it("exposes auth.uid() and the authenticated role inside the transaction", async () => {
    const row = await withUser({ id: USERS.alice }, async (trx) => {
      const { rows } = await sql<{
        uid: string;
        role: string;
      }>`select auth.uid()::text as uid, current_user::text as role`.execute(trx);
      return rows[0];
    });
    expect(row?.uid).toBe(USERS.alice);
    expect(row?.role).toBe("authenticated");
  });
});

describe("isolation between transactions", () => {
  it("leaves no role nor claims on the connection after a user context, even after an error", async () => {
    await expect(
      withUser({ id: USERS.alice }, async (trx) => {
        await sql`select 1`.execute(trx);
        throw new Error("boom");
      }),
    ).rejects.toThrow();

    // The pool has few connections: the next statement very likely reuses the same one.
    const after = await withSystem("test.isolation", async (trx) => {
      const { rows } = await sql<{ role: string; claims: string | null }>`
        select current_user::text as role, current_setting('request.jwt.claims', true) as claims
      `.execute(trx);
      return rows[0];
    });
    expect(after?.role).toBe("service_role");
    expect(after?.claims ?? "").toBe("");

    // Two users back to back: the second never inherits the first's identity.
    const first = await withUser({ id: USERS.alice }, async (trx) => {
      const { rows } = await sql<{ uid: string }>`select auth.uid()::text as uid`.execute(trx);
      return rows[0]?.uid;
    });
    const second = await withUser({ id: USERS.emma }, async (trx) => {
      const { rows } = await sql<{ uid: string }>`select auth.uid()::text as uid`.execute(trx);
      return rows[0]?.uid;
    });
    expect(first).toBe(USERS.alice);
    expect(second).toBe(USERS.emma);
  });

  it("rolls back the transaction when fn throws", async () => {
    await expect(
      withUser({ id: USERS.alice }, async (trx) => {
        await trx
          .updateTable("visits")
          .set({ subject: "Ne doit pas rester" })
          .where("id", "=", V1)
          .execute();
        throw new Error("rollback");
      }),
    ).rejects.toBeInstanceOf(UnexpectedError);
    const row = await withUser({ id: USERS.alice }, (trx) =>
      trx.selectFrom("visits").select("subject").where("id", "=", V1).executeTakeFirstOrThrow(),
    );
    expect(row.subject).not.toBe("Ne doit pas rester");
  });
});

describe("error translation", () => {
  it("maps 23505 to ConflictError", async () => {
    await expect(
      withSystem("test.conflict", (trx) =>
        trx.insertInto("sites").values({ warehouse_code: "TEST-001", name: "Doublon" }).execute(),
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("maps 23514 and 22P02 to ValidationError", async () => {
    await expect(
      withUser({ id: USERS.alice }, (trx) =>
        trx
          .insertInto("reserves")
          .values({
            visit_id: V1,
            action: "",
            responsible_kind: "internal",
            responsible_profile_id: USERS.alice,
          })
          .execute(),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      withUser({ id: USERS.alice }, (trx) =>
        trx.selectFrom("visits").select("id").where("id", "=", "pas-un-uuid").execute(),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("maps a refused RPC (42501) to ForbiddenError", async () => {
    await expect(
      withUser({ id: USERS.emma }, (trx) =>
        sql`select public.complete_visit(${V1}::uuid)`.execute(trx),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("maps a missing row to NotFoundError", async () => {
    await expect(
      withUser({ id: USERS.alice }, (trx) =>
        trx
          .selectFrom("visits")
          .select("id")
          .where("id", "=", "00000000-0000-4000-8000-00000000dead")
          .executeTakeFirstOrThrow(),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
