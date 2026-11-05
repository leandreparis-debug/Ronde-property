import "server-only";

import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/server/db";
import { withSystem } from "@/server/db/context";
import {
  ForbiddenError,
  UnauthenticatedError,
  UnexpectedError,
  ValidationError,
} from "@/server/errors";
import { log } from "@/server/log";
import { createAdminSupabaseClient } from "@/server/supabase/admin";
import { requireSupabasePublicConfig } from "@/server/supabase/config";

import { recordAuditInTrx } from "./audit";
import {
  generateTemporaryPassword,
  hashEmail,
  newPasswordSchema,
  normalizeEmail,
} from "./passwords";
import { hasActiveProfile } from "./profile-check";
import { revokeSessionsInDatabase } from "./revocation";
import type { AccountAdminService, AuthService, CookieStore, CreateAccountInput } from "./types";

/**
 * `supabase` provider: Supabase Auth through `@supabase/ssr` (cookies) for the session and
 * the admin API (service role) for accounts. Rights are never decided from `getSession()`:
 * `getUser()` verifies the token with the Auth server on every call.
 */
export function createSupabaseAuthService(deps: { cookies: CookieStore }): AuthService {
  function client() {
    const { url, anonKey } = requireSupabasePublicConfig();
    return createServerClient<Database>(url, anonKey, {
      cookies: {
        getAll: () => deps.cookies.getAll(),
        setAll: (cookies) =>
          deps.cookies.setAll(
            cookies.map(({ name, value, options }) => ({
              name,
              value,
              options: {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "lax",
                path: "/",
                maxAge: options.maxAge,
              },
            })),
          ),
      },
    });
  }

  /** Stateless client used to check a password without touching the session cookies. */
  function verificationClient() {
    const { url, anonKey } = requireSupabasePublicConfig();
    return createClient<Database>(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }

  return {
    async signIn(email, password) {
      const supabase = client();
      const key = hashEmail(email);
      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizeEmail(email),
        password,
      });
      if (error?.status === 429) return { ok: false, reason: "rate_limited" };
      const userId = data.user?.id;
      const active = !error && userId ? await hasActiveProfile(userId) : false;
      if (error || !userId || !active) {
        if (userId) await supabase.auth.signOut();
        await withSystem("audit.auth.sign_in_failed", (trx) =>
          recordAuditInTrx(
            trx,
            "auth.sign_in_failed",
            "auth",
            null,
            { email_hash: key, provider: "supabase" },
            null,
          ),
        );
        return { ok: false, reason: "invalid_credentials" };
      }
      await withSystem("audit.auth.signed_in", (trx) =>
        recordAuditInTrx(
          trx,
          "auth.signed_in",
          "profile",
          userId,
          { provider: "supabase" },
          userId,
        ),
      );
      return { ok: true, userId };
    },

    async signOut() {
      const supabase = client();
      const { data } = await supabase.auth.getUser();
      await supabase.auth.signOut();
      if (data.user) {
        const userId = data.user.id;
        await withSystem("audit.auth.signed_out", (trx) =>
          recordAuditInTrx(
            trx,
            "auth.signed_out",
            "profile",
            userId,
            { provider: "supabase" },
            userId,
          ),
        );
      }
    },

    async getVerifiedUserId() {
      const { data, error } = await client().auth.getUser();
      if (error || !data.user) return null;
      return data.user.id;
    },

    async getVerifiedSession() {
      const supabase = client();
      // getUser(): the Auth server checks the token and that its session still exists.
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) return null;
      // getClaims(): verified claims of the same token; `amr` keeps the time of the password
      // sign-in across refreshes (seconds).
      const claims = await supabase.auth.getClaims();
      const payload = claims.data?.claims;
      if (claims.error || !payload || payload.sub !== data.user.id) return null;
      const times = (Array.isArray(payload.amr) ? payload.amr : [])
        .map((entry) => (typeof entry === "object" && entry ? entry.timestamp : undefined))
        .filter((value): value is number => typeof value === "number");
      const seconds = times.length > 0 ? Math.max(...times) : payload.iat;
      if (typeof seconds !== "number") return null;
      return { userId: data.user.id, authenticatedAt: new Date(seconds * 1000) };
    },

    async changePassword(currentPassword, newPassword) {
      const supabase = client();
      const { data } = await supabase.auth.getUser();
      if (!data.user?.email) throw new UnauthenticatedError();
      const parsed = newPasswordSchema.safeParse(newPassword);
      if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message);
      if (currentPassword === newPassword) {
        throw new ValidationError("Le nouveau mot de passe doit être différent de l'actuel.");
      }
      const check = await verificationClient().auth.signInWithPassword({
        email: data.user.email,
        password: currentPassword,
      });
      if (check.error) throw new ForbiddenError("Le mot de passe actuel est incorrect.");

      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        log.error("auth.supabase.change_password_failed", { status: error.status });
        throw new UnexpectedError();
      }
      const userId = data.user.id;
      await withSystem("auth.supabase.change_password", (trx) =>
        trx
          .updateTable("profiles")
          .set({ must_change_password: false })
          .where("id", "=", userId)
          .execute(),
      );
    },
  };
}

/** Account administration for the `supabase` provider (service role, server only). */
export function createSupabaseAccountAdminService(): AccountAdminService {
  return {
    async revokeSessions(userId) {
      // The admin API cannot sign another user out without their token: the revocation date
      // is checked on every request against the `amr` time of the session (getVerifiedSession),
      // which a refresh does not change. Refresh tokens become useless.
      await revokeSessionsInDatabase(userId, "accounts.supabase.revoke_sessions");
    },

    async createAccount(input: CreateAccountInput) {
      const admin = createAdminSupabaseClient();
      const temporaryPassword = generateTemporaryPassword();
      const email = normalizeEmail(input.email);

      const { data, error } = await admin.auth.admin.createUser({
        email,
        password: temporaryPassword,
        email_confirm: true,
      });
      if (error || !data.user) {
        log.error("accounts.supabase.create_user_failed", { status: error?.status });
        if (error?.status === 422)
          throw new ValidationError("Cette adresse e-mail est déjà utilisée.");
        throw new UnexpectedError();
      }
      const userId = data.user.id;

      try {
        await withSystem("accounts.supabase.create_profile", (trx) =>
          trx
            .insertInto("profiles")
            .values({
              id: userId,
              email,
              full_name: input.fullName,
              role: input.role,
              is_active: true,
              must_change_password: true,
            })
            .execute(),
        );
      } catch (error) {
        // No orphan: remove the Auth user when the profile cannot be created.
        await admin.auth.admin.deleteUser(userId);
        throw error;
      }

      return { userId, temporaryPassword };
    },

    async resetPassword(userId) {
      const admin = createAdminSupabaseClient();
      const temporaryPassword = generateTemporaryPassword();
      const { error } = await admin.auth.admin.updateUserById(userId, {
        password: temporaryPassword,
      });
      if (error) {
        log.error("accounts.supabase.reset_password_failed", { status: error.status });
        throw new UnexpectedError();
      }
      await withSystem("accounts.supabase.reset_password", (trx) =>
        trx
          .updateTable("profiles")
          .set({ must_change_password: true })
          .where("id", "=", userId)
          .execute(),
      );
      return { temporaryPassword };
    },
  };
}
