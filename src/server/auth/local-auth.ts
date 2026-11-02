import "server-only";

import bcrypt from "bcryptjs";
import { sql } from "kysely";

import { withSystem } from "@/server/db/context";
import { ForbiddenError, UnauthenticatedError, ValidationError } from "@/server/errors";

import { recordAuditInTrx } from "./audit";
import {
  LOCAL_SESSION_COOKIE,
  LOCAL_SESSION_MAX_AGE_SECONDS,
  signLocalSession,
  verifyLocalSession,
} from "./local-session";
import {
  generateTemporaryPassword,
  hashEmail,
  newPasswordSchema,
  normalizeEmail,
} from "./passwords";
import { hasActiveProfile } from "./profile-check";
import { clearFailures, isRateLimited, recordFailure } from "./rate-limit";
import type { AccountAdminService, AuthService, CookieStore, CreateAccountInput } from "./types";

const BCRYPT_ROUNDS = 10;

export interface LocalAuthDeps {
  cookies: CookieStore;
  secret: string;
  /** `secure` cookie flag (true in production). */
  secure: boolean;
}

interface LocalUserRow {
  id: string;
  encrypted_password: string | null;
}

async function findLocalUser(email: string): Promise<LocalUserRow | null> {
  return withSystem("auth.local.find_user", async (trx) => {
    const { rows } = await sql<LocalUserRow>`
      select id::text as id, encrypted_password
      from auth.users
      where lower(email) = ${normalizeEmail(email)}
    `.execute(trx);
    return rows[0] ?? null;
  });
}

/**
 * `local` provider: accounts live in `auth.users` of the local database (bcrypt hashes),
 * the session is a signed JWT in an httpOnly cookie. Tests and development only; the
 * environment validation refuses it on Vercel or against a remote database.
 */
export function createLocalAuthService(deps: LocalAuthDeps): AuthService {
  const cookieOptions = {
    httpOnly: true,
    secure: deps.secure,
    sameSite: "lax" as const,
    path: "/",
  };

  function currentToken(): string | undefined {
    return deps.cookies.getAll().find((c) => c.name === LOCAL_SESSION_COOKIE)?.value;
  }

  return {
    async signIn(email, password) {
      const key = hashEmail(email);
      if (isRateLimited(key)) return { ok: false, reason: "rate_limited" };

      const user = await findLocalUser(email);
      const matches =
        user?.encrypted_password != null &&
        (await bcrypt.compare(password, user.encrypted_password));
      const active = matches && user ? await hasActiveProfile(user.id) : false;

      if (!user || !matches || !active) {
        recordFailure(key);
        await withSystem("audit.auth.sign_in_failed", (trx) =>
          recordAuditInTrx(
            trx,
            "auth.sign_in_failed",
            "auth",
            null,
            { email_hash: key, provider: "local" },
            null,
          ),
        );
        return { ok: false, reason: "invalid_credentials" };
      }

      clearFailures(key);
      const token = await signLocalSession(user.id, deps.secret);
      deps.cookies.setAll([
        {
          name: LOCAL_SESSION_COOKIE,
          value: token,
          options: { ...cookieOptions, maxAge: LOCAL_SESSION_MAX_AGE_SECONDS },
        },
      ]);
      await withSystem("audit.auth.signed_in", (trx) =>
        recordAuditInTrx(trx, "auth.signed_in", "profile", user.id, { provider: "local" }, user.id),
      );
      return { ok: true, userId: user.id };
    },

    async signOut() {
      const userId = await verifyLocalSession(currentToken(), deps.secret);
      deps.cookies.setAll([
        { name: LOCAL_SESSION_COOKIE, value: "", options: { ...cookieOptions, maxAge: 0 } },
      ]);
      if (userId) {
        await withSystem("audit.auth.signed_out", (trx) =>
          recordAuditInTrx(
            trx,
            "auth.signed_out",
            "profile",
            userId,
            { provider: "local" },
            userId,
          ),
        );
      }
    },

    async getVerifiedUserId() {
      return verifyLocalSession(currentToken(), deps.secret);
    },

    async changePassword(currentPassword, newPassword) {
      const userId = await verifyLocalSession(currentToken(), deps.secret);
      if (!userId) throw new UnauthenticatedError();
      const parsed = newPasswordSchema.safeParse(newPassword);
      if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message);
      if (currentPassword === newPassword) {
        throw new ValidationError("Le nouveau mot de passe doit être différent de l'actuel.");
      }

      await withSystem("auth.local.change_password", async (trx) => {
        const { rows } = await sql<LocalUserRow>`
          select id::text as id, encrypted_password from auth.users where id = ${userId}::uuid
        `.execute(trx);
        const user = rows[0];
        const matches =
          user?.encrypted_password != null &&
          (await bcrypt.compare(currentPassword, user.encrypted_password));
        if (!matches) throw new ForbiddenError("Le mot de passe actuel est incorrect.");
        const hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
        await sql`update auth.users set encrypted_password = ${hash}, updated_at = now() where id = ${userId}::uuid`.execute(
          trx,
        );
        await trx
          .updateTable("profiles")
          .set({ must_change_password: false })
          .where("id", "=", userId)
          .execute();
      });
    },
  };
}

/** Account administration for the `local` provider. */
export function createLocalAccountAdminService(): AccountAdminService {
  return {
    async createAccount(input: CreateAccountInput) {
      const temporaryPassword = generateTemporaryPassword();
      const hash = await bcrypt.hash(temporaryPassword, BCRYPT_ROUNDS);
      const email = normalizeEmail(input.email);

      const userId = await withSystem("accounts.local.create", async (trx) => {
        const { rows } = await sql<{ id: string }>`
          insert into auth.users (email, encrypted_password, email_confirmed_at)
          values (${email}, ${hash}, now())
          returning id::text as id
        `.execute(trx);
        const id = rows[0]?.id;
        if (!id) throw new Error("Création de l'utilisateur local impossible.");
        await trx
          .insertInto("profiles")
          .values({
            id,
            email,
            full_name: input.fullName,
            role: input.role,
            is_active: true,
            must_change_password: true,
          })
          .execute();
        return id;
      });

      return { userId, temporaryPassword };
    },

    async resetPassword(userId) {
      const temporaryPassword = generateTemporaryPassword();
      const hash = await bcrypt.hash(temporaryPassword, BCRYPT_ROUNDS);
      await withSystem("accounts.local.reset_password", async (trx) => {
        await sql`update auth.users set encrypted_password = ${hash}, updated_at = now() where id = ${userId}::uuid`.execute(
          trx,
        );
        await trx
          .updateTable("profiles")
          .set({ must_change_password: true })
          .where("id", "=", userId)
          .execute();
      });
      return { temporaryPassword };
    },
  };
}
