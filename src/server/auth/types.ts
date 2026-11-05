import type { UserRole } from "@/server/domain/enums";

/** Cookie as seen by the auth services; mirrors the `@supabase/ssr` adapter shape. */
export interface CookieRecord {
  name: string;
  value: string;
}

export interface CookieOptions {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "lax" | "strict" | "none";
  path?: string;
  maxAge?: number;
  expires?: Date;
}

/**
 * Access to the request cookies. In Next.js it wraps `cookies()` from `next/headers`;
 * in tests it is an in-memory store. Injected so the services stay testable.
 */
export interface CookieStore {
  getAll(): CookieRecord[];
  setAll(cookies: Array<CookieRecord & { options?: CookieOptions }>): void;
}

export type SignInResult =
  { ok: true; userId: string } | { ok: false; reason: "invalid_credentials" | "rate_limited" };

/**
 * Authentication: who is the caller, verified server-side. The role is never part of it:
 * it is read from `profiles` on every request (see session.ts).
 */
export interface AuthService {
  /** Generic failure reasons only: never reveals whether the account exists or is disabled. */
  signIn(email: string, password: string): Promise<SignInResult>;
  signOut(): Promise<void>;
  /** Verified identity (signature or Supabase `getUser()`), or null. */
  getVerifiedUserId(): Promise<string | null>;
  /**
   * Verified identity with the time of the sign-in that opened the session (kept across token
   * refreshes), compared with `profiles.sessions_revoked_at` on every request.
   */
  getVerifiedSession(): Promise<VerifiedSession | null>;
  /**
   * Replaces the current user's password. The current password is required so that the
   * new one is proven different from the temporary one without ever storing it in clear.
   */
  changePassword(currentPassword: string, newPassword: string): Promise<void>;
}

/** A session whose token was verified. */
export interface VerifiedSession {
  userId: string;
  /** Time of the sign-in (password) that opened the session. */
  authenticatedAt: Date;
}

export interface CreateAccountInput {
  email: string;
  fullName: string;
  role: UserRole;
}

/** Account administration: creates users and resets passwords. Admin-only callers. */
export interface AccountAdminService {
  /** Creates the auth user and its profile atomically (no orphan on failure). */
  createAccount(input: CreateAccountInput): Promise<{ userId: string; temporaryPassword: string }>;
  /** Sets a new temporary password; the user must change it at next sign-in. */
  resetPassword(userId: string): Promise<{ temporaryPassword: string }>;
  /**
   * Signs the user out of every device: sessions opened before now are refused at their next
   * request (`profiles.sessions_revoked_at`). Audit `profile.sessions_revoked` (trigger).
   */
  revokeSessions(userId: string): Promise<void>;
}

/** The current user as read from `profiles` on every request. */
export interface CurrentUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  mustChangePassword: boolean;
}
