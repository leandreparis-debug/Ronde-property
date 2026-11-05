import { type NextRequest, NextResponse } from "next/server";

import { buildCsp, createNonce } from "@/lib/security/csp";
import { PATHNAME_HEADER } from "@/server/auth/constants";
import { hasLocalSession, hasSupabaseSession } from "@/server/auth/edge-session";

/*
 * Route protection and session refresh. No database access here: the role is checked in
 * the pages (requireUser / requireRole). The middleware is a convenience layer, never the
 * only barrier.
 */

// `/api/cron` authenticates its caller itself (CRON_SECRET), without a user session.
const PUBLIC_PATHS = ["/connexion", "/design", "/hors-ligne", "/api/cron"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

function redirectToSignIn(request: NextRequest): NextResponse {
  const url = request.nextUrl.clone();
  const target = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  url.pathname = "/connexion";
  url.search = target === "/" ? "" : `?next=${encodeURIComponent(target)}`;
  return NextResponse.redirect(url);
}

export async function middleware(request: NextRequest) {
  // A fresh nonce per request: Next.js reads it from the request CSP header and puts it on
  // the scripts it renders (pages are rendered dynamically, see src/app/layout.tsx).
  const csp = buildCsp({
    nonce: createNonce(),
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    dev: process.env.NODE_ENV === "development",
  });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(PATHNAME_HEADER, request.nextUrl.pathname);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);

  const signedIn =
    process.env.AUTH_PROVIDER === "local"
      ? await hasLocalSession(request)
      : await hasSupabaseSession(request, response);

  if (!signedIn && !isPublic(request.nextUrl.pathname)) {
    return redirectToSignIn(request);
  }
  return response;
}

export const config = {
  // Everything except Next internals, the favicon and files with an extension.
  matcher: ["/((?!_next/static|_next/image|icon\\.svg|favicon\\.ico|.*\\..*).*)"],
};
