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

/** Signs a session token for the user, valid 8 hours. */
export async function signLocalSession(userId: string, secret: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${LOCAL_SESSION_MAX_AGE_SECONDS}s`)
    .sign(key(secret));
}

/** Returns the user id of a valid token, or null (bad signature, expired, malformed). */
export async function verifyLocalSession(
  token: string | undefined,
  secret: string,
): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(secret), {
      issuer: ISSUER,
      algorithms: ["HS256"],
    });
    return typeof payload.sub === "string" && payload.sub.length > 0 ? payload.sub : null;
  } catch {
    return null;
  }
}
