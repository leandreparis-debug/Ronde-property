import { type NextRequest, NextResponse } from "next/server";

import { PATHNAME_HEADER } from "@/server/auth/constants";
import { hasLocalSession, hasSupabaseSession } from "@/server/auth/edge-session";

/*
 * Route protection and session refresh. No database access here: the role is checked in
 * the pages (requireUser / requireRole). The middleware is a convenience layer, never the
 * only barrier.
 */

const PUBLIC_PATHS = ["/connexion", "/design", "/hors-ligne"];

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
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(PATHNAME_HEADER, request.nextUrl.pathname);
  const response = NextResponse.next({ request: { headers: requestHeaders } });

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
