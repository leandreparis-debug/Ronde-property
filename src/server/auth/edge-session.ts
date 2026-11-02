import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";

import { LOCAL_SESSION_COOKIE, verifyLocalSession } from "./local-session";

/*
 * Session checks used by the middleware (edge runtime): no database, no Node-only import.
 * They answer "is there a plausible session?"; the role is checked in the pages.
 */

/** Supabase provider: refreshes the session cookies and verifies the user with the Auth server. */
export async function hasSupabaseSession(
  request: NextRequest,
  response: NextResponse,
): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return false;

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookies) => {
        for (const { name, value, options } of cookies) {
          response.cookies.set(name, value, {
            ...options,
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/",
          });
        }
      },
    },
  });
  const { data } = await supabase.auth.getUser();
  return Boolean(data.user);
}

/** Local provider: verifies the signed session cookie (signature and expiry only). */
export async function hasLocalSession(request: NextRequest): Promise<boolean> {
  const secret = process.env.LOCAL_AUTH_SECRET;
  if (!secret) return false;
  const token = request.cookies.get(LOCAL_SESSION_COOKIE)?.value;
  return (await verifyLocalSession(token, secret)) !== null;
}
