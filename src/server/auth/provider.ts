import "server-only";

import { env } from "@/lib/env";
import {
  requireSupabasePublicConfig,
  requireSupabaseServiceRoleKey,
} from "@/server/supabase/config";

import { createLocalAccountAdminService, createLocalAuthService } from "./local-auth";
import { nextCookieStore } from "./next-cookies";
import { createSupabaseAccountAdminService, createSupabaseAuthService } from "./supabase-auth";
import type { AccountAdminService, AuthService } from "./types";

/**
 * `AuthService` for the configured provider (`AUTH_PROVIDER`, `supabase` by default).
 * The `local` provider is only reachable when env.ts accepted it (ALLOW_LOCAL_AUTH, secret,
 * no Vercel, local database).
 */
export async function getAuthService(): Promise<AuthService> {
  const cookies = await nextCookieStore();
  if (env.AUTH_PROVIDER === "local") {
    if (!env.ALLOW_LOCAL_AUTH || !env.LOCAL_AUTH_SECRET) {
      throw new Error(
        "Le fournisseur d'authentification local n'est pas autorisé dans cet environnement.",
      );
    }
    return createLocalAuthService({
      cookies,
      secret: env.LOCAL_AUTH_SECRET,
      secure: env.NODE_ENV === "production",
    });
  }
  requireSupabasePublicConfig();
  return createSupabaseAuthService({ cookies });
}

/** `AccountAdminService` for the configured provider. */
export function getAccountAdminService(): AccountAdminService {
  if (env.AUTH_PROVIDER === "local") {
    if (!env.ALLOW_LOCAL_AUTH) {
      throw new Error(
        "Le fournisseur d'authentification local n'est pas autorisé dans cet environnement.",
      );
    }
    return createLocalAccountAdminService();
  }
  requireSupabasePublicConfig();
  requireSupabaseServiceRoleKey();
  return createSupabaseAccountAdminService();
}
