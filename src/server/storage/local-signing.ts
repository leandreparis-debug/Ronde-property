import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * HMAC-SHA256 signatures of the local provider URLs. Pure functions, shared by the service
 * (which signs) and the route (which verifies). The signature covers the method, the bucket,
 * the path, the expiry, the maximum size and the content type, so none of them can be
 * altered by the holder of the URL.
 */

export const LOCAL_STORAGE_ROUTE = "/api/local-storage";

export type SignedMethod = "PUT" | "GET";

export interface SignatureInput {
  method: SignedMethod;
  bucket: string;
  path: string;
  /** Unix time in seconds. */
  expires: number;
  /** `PUT` only; `0` for `GET`. */
  maxBytes: number;
  /** `PUT` only; empty for `GET`. */
  contentType: string;
}

function canonical(input: SignatureInput): string {
  return [
    input.method,
    input.bucket,
    input.path,
    String(input.expires),
    String(input.maxBytes),
    input.contentType,
  ].join("\n");
}

/** Hex HMAC-SHA256 of the canonical form. */
export function signLocalUrl(secret: string, input: SignatureInput): string {
  return createHmac("sha256", secret).update(canonical(input)).digest("hex");
}

/** Root-relative URL of an object with its signed query string. */
export function buildLocalUrl(secret: string, input: SignatureInput): string {
  const params = new URLSearchParams();
  params.set("exp", String(input.expires));
  if (input.method === "PUT") {
    params.set("max", String(input.maxBytes));
    params.set("ct", input.contentType);
  }
  params.set("sig", signLocalUrl(secret, input));
  const encodedPath = input.path.split("/").map(encodeURIComponent).join("/");
  return `${LOCAL_STORAGE_ROUTE}/${encodeURIComponent(input.bucket)}/${encodedPath}?${params}`;
}

export type VerifyResult =
  | { ok: true; expiresAt: Date; maxBytes: number; contentType: string }
  | { ok: false; reason: "malformed" | "signature" | "expired" };

/**
 * Checks the query string of a local URL against the secret, for the given method, bucket
 * and path. The expiry is compared to `now`.
 */
export function verifyLocalUrl(
  secret: string,
  params: Pick<URLSearchParams, "get">,
  request: { method: SignedMethod; bucket: string; path: string },
  now: Date = new Date(),
): VerifyResult {
  const exp = params.get("exp");
  const sig = params.get("sig");
  if (!exp || !sig || !/^\d{1,12}$/.test(exp) || !/^[0-9a-f]{64}$/.test(sig)) {
    return { ok: false, reason: "malformed" };
  }
  const maxBytes = request.method === "PUT" ? Number(params.get("max") ?? NaN) : 0;
  const contentType = request.method === "PUT" ? (params.get("ct") ?? "") : "";
  if (request.method === "PUT" && (!Number.isInteger(maxBytes) || maxBytes <= 0 || !contentType)) {
    return { ok: false, reason: "malformed" };
  }
  const expected = signLocalUrl(secret, {
    method: request.method,
    bucket: request.bucket,
    path: request.path,
    expires: Number(exp),
    maxBytes,
    contentType,
  });
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(sig, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "signature" };
  }
  const expiresAt = new Date(Number(exp) * 1000);
  if (expiresAt.getTime() <= now.getTime()) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true, expiresAt, maxBytes, contentType };
}
