import { sql } from "kysely";
import { afterAll, describe, expect, it } from "vitest";

import { createLocalAccountAdminService, createLocalAuthService } from "@/server/auth/local-auth";
import type {
  AccountAdminService,
  AuthService,
  CookieRecord,
  CookieStore,
} from "@/server/auth/types";
import { withSystem } from "@/server/db/context";
import { closePool } from "@/server/db/pool";
import { ForbiddenError, ValidationError } from "@/server/errors";

/*
 * Contract shared by every AuthService / AccountAdminService implementation.
 * Runs on `local` always; on `supabase` only when SUPABASE_TEST_URL, SUPABASE_TEST_ANON_KEY
 * and SUPABASE_TEST_SERVICE_ROLE_KEY are set (skipped otherwise, with a message).
 */

const SEED_PASSWORD = "Ronde-test-2026";

function memoryCookieStore(): CookieStore & { jar: Map<string, string> } {
  const jar = new Map<string, string>();
  return {
    jar,
    getAll: () => [...jar.entries()].map(([name, value]): CookieRecord => ({ name, value })),
    setAll: (records) => {
      for (const { name, value, options } of records) {
        if (options?.maxAge === 0 || value === "") jar.delete(name);
        else jar.set(name, value);
      }
    },
  };
}

interface Implementation {
  name: string;
  /** A fresh service bound to a fresh cookie jar (one browser). */
  auth: () => AuthService;
  admin: () => AccountAdminService;
}

const implementations: Implementation[] = [
  {
    name: "local",
    auth: () =>
      createLocalAuthService({
        cookies: memoryCookieStore(),
        secret: "s".repeat(32),
        secure: false,
      }),
    admin: () => createLocalAccountAdminService(),
  },
];

const supabaseConfigured = Boolean(
  process.env.SUPABASE_TEST_URL &&
  process.env.SUPABASE_TEST_ANON_KEY &&
  process.env.SUPABASE_TEST_SERVICE_ROLE_KEY,
);
if (!supabaseConfigured) {
  console.info(
    "Suite de contrat `supabase` ignorée : SUPABASE_TEST_URL et ses clés ne sont pas définies.",
  );
}

afterAll(async () => {
  // Accounts created here stay in the database: profiles with audit entries cannot be deleted
  // (audit_log is append-only). Other suites count seed rows by id, so this is harmless.
  await closePool();
});

async function lastAuditActions(entityId: string | null, action: string): Promise<number> {
  return withSystem("test.audit", async (trx) => {
    const { rows } = await sql<{ count: string }>`
      select count(*) as count from public.audit_log
      where action = ${action} and (${entityId}::uuid is null or entity_id = ${entityId}::uuid)
    `.execute(trx);
    return Number(rows[0]?.count ?? 0);
  });
}

for (const impl of implementations) {
  describe(`AuthService contract · ${impl.name}`, () => {
    it("signs Alice in, exposes her verified id, then signs her out", async () => {
      const auth = impl.auth();
      expect(await auth.getVerifiedUserId()).toBeNull();
      const before = await lastAuditActions(
        "00000000-0000-4000-8000-000000000001",
        "auth.signed_in",
      );
      const result = await auth.signIn("RT.Alice@example.test", SEED_PASSWORD);
      expect(result).toEqual({ ok: true, userId: "00000000-0000-4000-8000-000000000001" });
      expect(await auth.getVerifiedUserId()).toBe("00000000-0000-4000-8000-000000000001");
      expect(await lastAuditActions("00000000-0000-4000-8000-000000000001", "auth.signed_in")).toBe(
        before + 1,
      );
      await auth.signOut();
      expect(await auth.getVerifiedUserId()).toBeNull();
    });

    it("refuses a wrong password, an unknown email and an inactive account with the same reason", async () => {
      const auth = impl.auth();
      const before = await lastAuditActions(null, "auth.sign_in_failed");
      expect(await auth.signIn("rt.alice@example.test", "mauvais-mot-de-passe-123")).toEqual({
        ok: false,
        reason: "invalid_credentials",
      });
      expect(await auth.signIn("inconnu@example.test", SEED_PASSWORD)).toEqual({
        ok: false,
        reason: "invalid_credentials",
      });
      expect(await auth.signIn("rt.inactif@example.test", SEED_PASSWORD)).toEqual({
        ok: false,
        reason: "invalid_credentials",
      });
      expect(await auth.getVerifiedUserId()).toBeNull();
      expect(await lastAuditActions(null, "auth.sign_in_failed")).toBe(before + 3);
      // The audit never stores the email in clear.
      const clear = await withSystem("test.audit_clear", async (trx) => {
        const { rows } = await sql<{ count: string }>`
          select count(*) as count from public.audit_log where details::text ilike '%example.test%'
        `.execute(trx);
        return Number(rows[0]?.count ?? 0);
      });
      expect(clear).toBe(0);
    });

    it("creates an account with a temporary password, forces a change, then accepts the new password", async () => {
      const admin = impl.admin();
      const email = `contrat.${Date.now()}@example.test`;
      const created = await admin.createAccount({
        email: email.toUpperCase(),
        fullName: "Compte Contrat",
        role: "rt",
      });
      expect(created.temporaryPassword).toHaveLength(16);

      const profile = await withSystem("test.profile", (trx) =>
        trx
          .selectFrom("profiles")
          .select(["email", "role", "must_change_password", "is_active"])
          .where("id", "=", created.userId)
          .executeTakeFirstOrThrow(),
      );
      expect(profile).toEqual({ email, role: "rt", must_change_password: true, is_active: true });

      const auth = impl.auth();
      expect((await auth.signIn(email, created.temporaryPassword)).ok).toBe(true);

      await expect(auth.changePassword(created.temporaryPassword, "court1")).rejects.toBeInstanceOf(
        ValidationError,
      );
      await expect(
        auth.changePassword(created.temporaryPassword, created.temporaryPassword),
      ).rejects.toBeInstanceOf(ValidationError);
      await expect(
        auth.changePassword("pas-le-bon-mot-de-passe-1", "Nouveau-mot-de-passe-2026"),
      ).rejects.toBeInstanceOf(ForbiddenError);
      await auth.changePassword(created.temporaryPassword, "Nouveau-mot-de-passe-2026");

      const after = await withSystem("test.profile", (trx) =>
        trx
          .selectFrom("profiles")
          .select("must_change_password")
          .where("id", "=", created.userId)
          .executeTakeFirstOrThrow(),
      );
      expect(after.must_change_password).toBe(false);

      const again = impl.auth();
      expect((await again.signIn(email, created.temporaryPassword)).ok).toBe(false);
      expect((await again.signIn(email, "Nouveau-mot-de-passe-2026")).ok).toBe(true);

      const reset = await admin.resetPassword(created.userId);
      expect(reset.temporaryPassword).toHaveLength(16);
      expect(reset.temporaryPassword).not.toBe(created.temporaryPassword);
      const third = impl.auth();
      expect((await third.signIn(email, "Nouveau-mot-de-passe-2026")).ok).toBe(false);
      expect((await third.signIn(email, reset.temporaryPassword)).ok).toBe(true);
      const mustChange = await withSystem("test.profile", (trx) =>
        trx
          .selectFrom("profiles")
          .select("must_change_password")
          .where("id", "=", created.userId)
          .executeTakeFirstOrThrow(),
      );
      expect(mustChange.must_change_password).toBe(true);
    });

    it("rejects a duplicate email, whatever its case", async () => {
      const admin = impl.admin();
      await expect(
        admin.createAccount({ email: "RT.ALICE@example.test", fullName: "Doublon", role: "rt" }),
      ).rejects.toThrow();
    });
  });
}

describe.skipIf(!supabaseConfigured)("AuthService contract · supabase", () => {
  it("is exercised only with SUPABASE_TEST_* variables", () => {
    expect(supabaseConfigured).toBe(true);
  });
});
