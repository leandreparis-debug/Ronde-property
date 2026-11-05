import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

/**
 * True when the `Authorization` header is exactly `Bearer <secret>`. Compared in constant time
 * (on SHA-256 digests, so the length leaks nothing). Without a configured secret (32 characters
 * minimum, `CRON_SECRET`), nobody is authorised.
 */
export function isAuthorizedCronRequest(
  authorization: string | null,
  secret: string | undefined,
): boolean {
  if (!secret || secret.length < 32 || !authorization) return false;
  return timingSafeEqual(digest(authorization), digest(`Bearer ${secret}`));
}
