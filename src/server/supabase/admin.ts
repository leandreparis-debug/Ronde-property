import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/server/db";

import { requireSupabasePublicConfig, requireSupabaseServiceRoleKey } from "./config";

/**
 * Supabase client with the service role key. It bypasses Row Level Security:
 * reserve it to server-side administration (account creation, VIGIE import).
 * Never import it from a Client Component: `server-only` makes that a build error.
 *
 * Throws if the variables are missing at call time.
 */
export function createAdminSupabaseClient() {
  const { url } = requireSupabasePublicConfig();
  const serviceRoleKey = requireSupabaseServiceRoleKey();
  return createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
