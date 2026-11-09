import "server-only";

import { forbidden, redirect } from "next/navigation";
import { headers } from "next/headers";
import { cache } from "react";

import { withSystem } from "@/server/db/context";
import type { UserRole } from "@/server/domain/enums";
import { ForbiddenError, UnauthenticatedError } from "@/server/errors";

import { PATHNAME_HEADER } from "./constants";
import { getAuthService } from "./provider";
import { isSessionRevoked } from "./revocation";
import type { CurrentUser } from "./types";

export { PATHNAME_HEADER } from "./constants";

/** Paths that stay reachable while a password change is pending. */
const PASSWORD_CHANGE_ALLOWED = new Set(["/changer-mot-de-passe", "/deconnexion"]);

/**
 * Validates a `next` parameter: internal absolute path only (no scheme, no `//host`).
 * Anything else falls back to `/`.
 */
export function safeNext(value: string | null | undefined): string {
  if (!value) return "/";
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/";
  if (/[\r\n]/.test(value)) return "/";
  if (value.startsWith("/connexion")) return "/";
  return value;
}

/** Pure role check, shared by pages and actions. */
export function hasRole(user: CurrentUser | null, roles: readonly UserRole[]): user is CurrentUser {
  return user !== null && roles.includes(user.role);
}

/**
 * Outcome of the session check. The sync routes (step 12) tell the device **why** it is signed
 * out, so that a revoked or deactivated account wipes its local copy while an expired session
 * only asks to sign in again.
 */
export type SessionStatus =
  | { kind: "ok"; user: CurrentUser }
  | { kind: "signed_out" }
  | { kind: "revoked" }
  | { kind: "inactive" };

/**
 * Verifies the session of this request: identity from the auth provider (signature or
 * Supabase `getUser()`), then the profile re-read from `profiles`. Memoised per request.
 */
export const getSessionStatus = cache(async (): Promise<SessionStatus> => {
  const auth = await getAuthService();
  const session = await auth.getVerifiedSession();
  if (!session) return { kind: "signed_out" };
  const { userId } = session;

  const profile = await withSystem("session", (trx) =>
    trx
      .selectFrom("profiles")
      .select([
        "id",
        "email",
        "full_name",
        "role",
        "is_active",
        "must_change_password",
        "sessions_revoked_at",
      ])
      .where("id", "=", userId)
      .executeTakeFirst(),
  );
  if (!profile) return { kind: "signed_out" };
  if (!profile.is_active) return { kind: "inactive" };
  if (isSessionRevoked(session.authenticatedAt, profile.sessions_revoked_at)) {
    return { kind: "revoked" };
  }

  return {
    kind: "ok",
    user: {
      id: profile.id,
      email: profile.email,
      fullName: profile.full_name,
      role: profile.role,
      mustChangePassword: profile.must_change_password,
    },
  };
});

/**
 * The current user, verified for this request: identity from the auth provider
 * (signature or Supabase `getUser()`), then the profile re-read from `profiles`.
 * Returns null when signed out, without profile, **inactive**, or when the session was opened
 * before `sessions_revoked_at` (« Déconnecter toutes les sessions », deactivation): such a user
 * is signed out at their next request. Memoised per request.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const status = await getSessionStatus();
  return status.kind === "ok" ? status.user : null;
});

async function currentPathname(): Promise<string> {
  const value = (await headers()).get(PATHNAME_HEADER);
  return value && value.startsWith("/") ? value : "/";
}

/**
 * For pages: returns the current user or redirects to `/connexion?next=…`. Redirects to
 * `/changer-mot-de-passe` while a password change is pending, except on that page.
 *
 * @example
 * export default async function Page() {
 *   const user = await requireUser();
 *   …
 * }
 */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  const pathname = await currentPathname();
  if (!user) {
    const next = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
    redirect(`/connexion${next}`);
  }
  if (user.mustChangePassword && !PASSWORD_CHANGE_ALLOWED.has(pathname)) {
    redirect("/changer-mot-de-passe");
  }
  return user;
}

/**
 * For pages: like `requireUser`, then renders the 403 page when the role is not allowed.
 *
 * @example
 * const admin = await requireRole(["admin"]);
 */
export async function requireRole(roles: readonly UserRole[]): Promise<CurrentUser> {
  const user = await requireUser();
  if (!hasRole(user, roles)) forbidden();
  return user;
}

/**
 * For Server Actions: returns the current user or throws (`UnauthenticatedError`,
 * `ForbiddenError`). Never redirects, so the caller can show a message.
 *
 * @example
 * export async function createAccountAction(form: FormData) {
 *   "use server";
 *   const admin = await requireRoleForAction(["admin"]);
 *   …
 * }
 */
export async function requireRoleForAction(roles: readonly UserRole[]): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthenticatedError();
  if (!hasRole(user, roles)) throw new ForbiddenError();
  return user;
}

/** For Server Actions: the current user or `UnauthenticatedError`. */
export async function requireUserForAction(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthenticatedError();
  return user;
}
