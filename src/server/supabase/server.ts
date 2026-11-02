import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { Database } from "@/server/db";

import { requireSupabasePublicConfig } from "./config";

/**
 * Supabase client for Server Components, Route Handlers and Server Actions.
 * Reads and refreshes the session through Next.js cookies. Requests run as the
 * signed-in user, so Row Level Security applies.
 *
 * Throws if the Supabase variables are missing at call time.
 */
export async function createServerSupabaseClient() {
  const { url, anonKey } = requireSupabasePublicConfig();
  const cookieStore = await cookies();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component: cookies are read-only there. The proxy
          // or a Route Handler refreshes the session instead.
        }
      },
    },
  });
}
