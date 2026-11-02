import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/server/db";

import { requireSupabasePublicConfig } from "./config";

/**
 * Supabase client for the browser. The only client-side entry point to Supabase,
 * used later for direct uploads to Storage (step 7). Requests run as the signed-in
 * user, so Row Level Security applies.
 *
 * Throws if the public Supabase variables are missing at call time.
 */
export function createBrowserSupabaseClient() {
  const { url, anonKey } = requireSupabasePublicConfig();
  return createBrowserClient<Database>(url, anonKey);
}
