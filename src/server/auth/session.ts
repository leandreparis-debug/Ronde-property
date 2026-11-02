import "server-only";

import { forbidden, redirect } from "next/navigation";
import { headers } from "next/headers";
import { cache } from "react";

import { withSystem } from "@/server/db/context";
import type { UserRole } from "@/server/domain/enums";
import { ForbiddenError, UnauthenticatedError } from "@/server/errors";

import { PATHNAME_HEADER } from "./constants";
import { getAuthService } from "./provider";
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
 * The current user, verified for this request: identity from the auth provider
 * (signature or Supabase `getUser()`), then the profile re-read from `profiles`.
 * Returns null when signed out, without profile, or **inactive**: a deactivated user is
 * signed out at their next request. Memoised per request.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const auth = await getAuthService();
  const userId = await auth.getVerifiedUserId();
  if (!userId) return null;

  const profile = await withSystem("session", (trx) =>
    trx
      .selectFrom("profiles")
      .select(["id", "email", "full_name", "role", "is_active", "must_change_password"])
      .where("id", "=", userId)
      .executeTakeFirst(),
  );
  if (!profile || !profile.is_active) return null;

  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.full_name,
    role: profile.role,
    mustChangePassword: profile.must_change_password,
  };
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
