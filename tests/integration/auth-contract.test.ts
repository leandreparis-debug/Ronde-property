import { sql } from "kysely";
import { afterAll, describe, expect, it } from "vitest";

import { createLocalAccountAdminService, createLocalAuthService } from "@/server/auth/local-auth";
import { isSessionRevoked } from "@/server/auth/revocation";
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
 *
 * - `pnpm test:db` runs it on `local` (ronde_test, seed accounts available).
 * - `pnpm test:contract` (scripts/ops/test-contract.mjs) runs it on `supabase`, against the
 *   Supabase TEST project only (RONDE_CONTRACT_PROVIDER=supabase, guards in the script). There
 *   the seed does not exist: only the self-contained part runs, and every account it creates is
 *   deactivated and anonymised at the end (a profile is never deleted, rule 22).
 */

const SEED_PASSWORD = "Ronde-test-2026";
const PROVIDER = process.env.RONDE_CONTRACT_PROVIDER === "supabase" ? "supabase" : "local";

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
  name: "local" | "supabase";
  /** The seed accounts (Alice, the inactive account…) exist: local only. */
  seeded: boolean;
  /** A fresh service bound to a fresh cookie jar (one browser). */
  auth: () => AuthService | Promise<AuthService>;
  admin: () => AccountAdminService | Promise<AccountAdminService>;
}

const local: Implementation = {
  name: "local",
  seeded: true,
  auth: () =>
    createLocalAuthService({
      cookies: memoryCookieStore(),
      secret: "s".repeat(32),
      secure: false,
    }),
  admin: () => createLocalAccountAdminService(),
};

const supabase: Implementation = {
  name: "supabase",
  seeded: false,
  // Imported lazily: the Supabase clients read their configuration at call time.
  auth: async () =>
    (await import("@/server/auth/supabase-auth")).createSupabaseAuthService({
      cookies: memoryCookieStore(),
    }),
  admin: async () =>
    (await import("@/server/auth/supabase-auth")).createSupabaseAccountAdminService(),
};

const implementations: Implementation[] = PROVIDER === "supabase" ? [supabase] : [local];

/** Accounts created by the contract, cleaned up at the end. */
const created: { impl: Implementation; userId: string }[] = [];

function uniqueEmail(label: string): string {
  return `${label}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@example.test`;
}

async function createTestAccount(impl: Implementation, email: string, fullName: string) {
  const account = await (await impl.admin()).createAccount({ email, fullName, role: "rt" });
  created.push({ impl, userId: account.userId });
  return account;
}

/** Deactivates then anonymises an account (profile, sign-in identity). */
async function anonymize(impl: Implementation, userId: string): Promise<void> {
  const email = await withSystem("contract.anonymize", async (trx) => {
    await trx.updateTable("profiles").set({ is_active: false }).where("id", "=", userId).execute();
    await sql`select private.anonymize_profile(${userId}::uuid, null)`.execute(trx);
    const row = await trx
      .selectFrom("profiles")
      .select("email")
      .where("id", "=", userId)
      .executeTakeFirstOrThrow();
    return row.email;
  });
  await (await impl.admin()).anonymizeIdentity(userId, email);
}

afterAll(async () => {
  // Cleanup: every account created here is deactivated and anonymised (profiles and their
  // audit entries are never deleted). Accounts already anonymised by a test are skipped.
  for (const { impl, userId } of created) {
    const done = await withSystem("contract.cleanup", (trx) =>
      trx
        .selectFrom("profiles")
        .select("anonymized_at")
        .where("id", "=", userId)
        .executeTakeFirst(),
    );
    if (done && done.anonymized_at === null) await anonymize(impl, userId);
  }
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

async function revokedAt(userId: string) {
  const row = await withSystem("test.revoked_at", (trx) =>
    trx
      .selectFrom("profiles")
      .select("sessions_revoked_at")
      .where("id", "=", userId)
      .executeTakeFirstOrThrow(),
  );
  return row.sessions_revoked_at;
}

for (const impl of implementations) {
  describe.runIf(impl.seeded)(`AuthService contract · ${impl.name} · seed accounts`, () => {
    it("signs Alice in, exposes her verified id, then signs her out", async () => {
      const auth = await impl.auth();
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
      const auth = await impl.auth();
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
  });

  describe(`AuthService contract · ${impl.name}`, () => {
    it("creates an account with a temporary password, forces a change, then accepts the new password", async () => {
      const admin = await impl.admin();
      const email = uniqueEmail("contrat");
      const created = await createTestAccount(impl, email.toUpperCase(), "Compte Contrat");
      expect(created.temporaryPassword).toHaveLength(16);

      const profile = await withSystem("test.profile", (trx) =>
        trx
          .selectFrom("profiles")
          .select(["email", "role", "must_change_password", "is_active"])
          .where("id", "=", created.userId)
          .executeTakeFirstOrThrow(),
      );
      expect(profile).toEqual({ email, role: "rt", must_change_password: true, is_active: true });

      const auth = await impl.auth();
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

      const again = await impl.auth();
      expect((await again.signIn(email, created.temporaryPassword)).ok).toBe(false);
      expect((await again.signIn(email, "Nouveau-mot-de-passe-2026")).ok).toBe(true);

      const reset = await admin.resetPassword(created.userId);
      expect(reset.temporaryPassword).toHaveLength(16);
      expect(reset.temporaryPassword).not.toBe(created.temporaryPassword);
      const third = await impl.auth();
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

    it("revokes every session of an account: older sessions refused, a new sign-in accepted", async () => {
      const admin = await impl.admin();
      const email = uniqueEmail("sessions");
      const { userId, temporaryPassword } = await createTestAccount(impl, email, "Compte Sessions");

      const tablet = await impl.auth();
      const computer = await impl.auth();
      await tablet.signIn(email, temporaryPassword);
      await computer.signIn(email, temporaryPassword);
      const before = await tablet.getVerifiedSession();
      expect(before?.userId).toBe(userId);
      expect(before!.authenticatedAt.getTime()).toBeLessThanOrEqual(Date.now());
      expect(isSessionRevoked(before!.authenticatedAt, await revokedAt(userId))).toBe(false);

      // The revocation date is truncated to the second: leave the second of the sign-ins.
      await new Promise((resolve) => setTimeout(resolve, 1_100));
      const audits = await lastAuditActions(userId, "profile.sessions_revoked");
      await admin.revokeSessions(userId);
      expect(await lastAuditActions(userId, "profile.sessions_revoked")).toBe(audits + 1);
      for (const device of [tablet, computer]) {
        const session = await device.getVerifiedSession();
        expect(isSessionRevoked(session!.authenticatedAt, await revokedAt(userId))).toBe(true);
      }

      const again = await impl.auth();
      await again.signIn(email, temporaryPassword);
      const fresh = await again.getVerifiedSession();
      expect(isSessionRevoked(fresh!.authenticatedAt, await revokedAt(userId))).toBe(false);
    });

    it("deactivation cuts every session and refuses a new sign-in", async () => {
      const email = uniqueEmail("desactivation");
      const { userId, temporaryPassword } = await createTestAccount(
        impl,
        email,
        "Compte Désactivé",
      );
      const tablet = await impl.auth();
      expect((await tablet.signIn(email, temporaryPassword)).ok).toBe(true);
      const session = await tablet.getVerifiedSession();
      await new Promise((resolve) => setTimeout(resolve, 1_100));

      await withSystem("contract.deactivate", (trx) =>
        trx.updateTable("profiles").set({ is_active: false }).where("id", "=", userId).execute(),
      );
      expect(isSessionRevoked(session!.authenticatedAt, await revokedAt(userId))).toBe(true);
      expect((await (await impl.auth()).signIn(email, temporaryPassword)).ok).toBe(false);
    });

    it("anonymisation replaces the identity: the former e-mail and password no longer sign in", async () => {
      const email = uniqueEmail("anonymisation");
      const { userId, temporaryPassword } = await createTestAccount(impl, email, "Compte Anonyme");
      await anonymize(impl, userId);
      const profile = await withSystem("contract.profile", (trx) =>
        trx
          .selectFrom("profiles")
          .select(["full_name", "email", "anonymized_at", "is_active"])
          .where("id", "=", userId)
          .executeTakeFirstOrThrow(),
      );
      expect(profile.full_name).toMatch(/^Compte anonymisé /);
      expect(profile.email).toMatch(/@ronde\.invalid$/);
      expect(profile.anonymized_at).not.toBeNull();
      expect(profile.is_active).toBe(false);
      expect(await lastAuditActions(userId, "profile.anonymized")).toBe(1);
      const auth = await impl.auth();
      expect((await auth.signIn(email, temporaryPassword)).ok).toBe(false);
      expect((await auth.signIn(profile.email, temporaryPassword)).ok).toBe(false);
    });

    it("rejects a duplicate email, whatever its case", async () => {
      const email = uniqueEmail("doublon");
      await createTestAccount(impl, email, "Compte Doublon");
      await expect(
        (await impl.admin()).createAccount({
          email: email.toUpperCase(),
          fullName: "Doublon",
          role: "rt",
        }),
      ).rejects.toThrow();
    });
  });
}
