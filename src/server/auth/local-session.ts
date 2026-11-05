import { jwtVerify, SignJWT } from "jose";

/*
 * Session of the `local` auth provider: a signed JWT (HS256) in an httpOnly cookie.
 * Edge-compatible (used by the middleware): no Node-only import here.
 */

export const LOCAL_SESSION_COOKIE = "ronde_local_session";
export const LOCAL_SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;
const ISSUER = "ronde-local";

function key(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

/** Signs a session token for the user, valid 8 hours; `auth_time` is the sign-in time (ms). */
export async function signLocalSession(
  userId: string,
  secret: string,
  authTime: number = Date.now(),
): Promise<string> {
  return new SignJWT({ auth_time: authTime })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${LOCAL_SESSION_MAX_AGE_SECONDS}s`)
    .sign(key(secret));
}

/** Verified content of a local session token. */
export interface LocalSessionClaims {
  userId: string;
  /** Sign-in time: `auth_time` (ms), or `iat` for older tokens. */
  authenticatedAt: Date;
}

/** Returns the claims of a valid token, or null (bad signature, expired, malformed). */
export async function verifyLocalSessionClaims(
  token: string | undefined,
  secret: string,
): Promise<LocalSessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(secret), {
      issuer: ISSUER,
      algorithms: ["HS256"],
    });
    if (typeof payload.sub !== "string" || payload.sub.length === 0) return null;
    const authTime =
      typeof payload.auth_time === "number"
        ? payload.auth_time
        : typeof payload.iat === "number"
          ? payload.iat * 1000
          : null;
    if (authTime === null) return null;
    return { userId: payload.sub, authenticatedAt: new Date(authTime) };
  } catch {
    return null;
  }
}

/** Returns the user id of a valid token, or null (bad signature, expired, malformed). */
export async function verifyLocalSession(
  token: string | undefined,
  secret: string,
): Promise<string | null> {
  return (await verifyLocalSessionClaims(token, secret))?.userId ?? null;
}
