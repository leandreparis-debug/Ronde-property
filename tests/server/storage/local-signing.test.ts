import { describe, expect, it } from "vitest";

import {
  buildLocalUrl,
  LOCAL_STORAGE_ROUTE,
  type SignatureInput,
  signLocalUrl,
  verifyLocalUrl,
} from "@/server/storage/local-signing";

const SECRET = "test-secret-with-at-least-32-characters-0000";
const NOW = new Date("2026-11-03T10:00:00Z");
const EXPIRES = Math.floor(NOW.getTime() / 1000) + 120;

const put: SignatureInput = {
  method: "PUT",
  bucket: "visit-photos",
  path: "visit-1/photo-1.jpg",
  expires: EXPIRES,
  maxBytes: 4_000_000,
  contentType: "image/jpeg",
};

function params(url: string): URLSearchParams {
  return new URL(url, "http://ronde.test").searchParams;
}

describe("buildLocalUrl / verifyLocalUrl", () => {
  it("builds a root-relative URL under the local route with the signed query", () => {
    const url = buildLocalUrl(SECRET, put);
    expect(url.startsWith(`${LOCAL_STORAGE_ROUTE}/visit-photos/visit-1/photo-1.jpg?`)).toBe(true);
    const query = params(url);
    expect(query.get("exp")).toBe(String(EXPIRES));
    expect(query.get("max")).toBe("4000000");
    expect(query.get("ct")).toBe("image/jpeg");
    expect(query.get("sig")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("accepts a valid PUT URL and returns its limits", () => {
    const verdict = verifyLocalUrl(
      SECRET,
      params(buildLocalUrl(SECRET, put)),
      { method: "PUT", bucket: "visit-photos", path: "visit-1/photo-1.jpg" },
      NOW,
    );
    expect(verdict).toEqual({
      ok: true,
      expiresAt: new Date(EXPIRES * 1000),
      maxBytes: 4_000_000,
      contentType: "image/jpeg",
    });
  });

  it("accepts a valid GET URL without size or type", () => {
    const get: SignatureInput = { ...put, method: "GET", maxBytes: 0, contentType: "" };
    const url = buildLocalUrl(SECRET, get);
    expect(params(url).has("max")).toBe(false);
    expect(params(url).has("ct")).toBe(false);
    const verdict = verifyLocalUrl(
      SECRET,
      params(url),
      { method: "GET", bucket: "visit-photos", path: "visit-1/photo-1.jpg" },
      NOW,
    );
    expect(verdict.ok).toBe(true);
  });

  it("refuses a URL once expired", () => {
    const verdict = verifyLocalUrl(
      SECRET,
      params(buildLocalUrl(SECRET, put)),
      { method: "PUT", bucket: "visit-photos", path: "visit-1/photo-1.jpg" },
      new Date(EXPIRES * 1000),
    );
    expect(verdict).toEqual({ ok: false, reason: "expired" });
  });

  it("refuses any tampering: method, bucket, path, size, type, expiry or secret", () => {
    const query = params(buildLocalUrl(SECRET, put));
    const target = { method: "PUT" as const, bucket: "visit-photos", path: "visit-1/photo-1.jpg" };
    expect(verifyLocalUrl(SECRET, query, { ...target, method: "GET" }, NOW).ok).toBe(false);
    expect(verifyLocalUrl(SECRET, query, { ...target, bucket: "reports" }, NOW).ok).toBe(false);
    expect(verifyLocalUrl(SECRET, query, { ...target, path: "visit-2/photo-1.jpg" }, NOW).ok).toBe(
      false,
    );
    expect(verifyLocalUrl("another-secret-with-32-characters-000000", query, target, NOW).ok).toBe(
      false,
    );

    const bigger = new URLSearchParams(query);
    bigger.set("max", "99999999");
    expect(verifyLocalUrl(SECRET, bigger, target, NOW)).toEqual({ ok: false, reason: "signature" });

    const other = new URLSearchParams(query);
    other.set("ct", "text/plain");
    expect(verifyLocalUrl(SECRET, other, target, NOW)).toEqual({ ok: false, reason: "signature" });

    const later = new URLSearchParams(query);
    later.set("exp", String(EXPIRES + 3600));
    expect(verifyLocalUrl(SECRET, later, target, NOW)).toEqual({ ok: false, reason: "signature" });

    const forged = new URLSearchParams(query);
    forged.set("sig", "0".repeat(64));
    expect(verifyLocalUrl(SECRET, forged, target, NOW)).toEqual({ ok: false, reason: "signature" });
  });

  it("refuses malformed queries without comparing signatures", () => {
    const target = { method: "PUT" as const, bucket: "visit-photos", path: "x/y.jpg" };
    expect(verifyLocalUrl(SECRET, new URLSearchParams(""), target, NOW)).toEqual({
      ok: false,
      reason: "malformed",
    });
    expect(
      verifyLocalUrl(SECRET, new URLSearchParams("exp=abc&sig=" + "a".repeat(64)), target, NOW),
    ).toEqual({ ok: false, reason: "malformed" });
    expect(
      verifyLocalUrl(SECRET, new URLSearchParams(`exp=${EXPIRES}&sig=short`), target, NOW),
    ).toEqual({ ok: false, reason: "malformed" });
    // PUT without size or type.
    const sig = signLocalUrl(SECRET, { ...put, maxBytes: 0, contentType: "" });
    expect(
      verifyLocalUrl(SECRET, new URLSearchParams(`exp=${EXPIRES}&sig=${sig}`), target, NOW),
    ).toEqual({ ok: false, reason: "malformed" });
  });
});
