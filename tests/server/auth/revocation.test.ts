import { describe, expect, it } from "vitest";

import { isSessionRevoked } from "@/server/auth/revocation";

describe("isSessionRevoked", () => {
  const revokedAt = "2026-11-05T10:00:00.000Z";

  it("keeps every session when nothing was revoked", () => {
    expect(isSessionRevoked(new Date("2020-01-01T00:00:00Z"), null)).toBe(false);
  });

  it("refuses a session opened before the revocation", () => {
    expect(isSessionRevoked(new Date("2026-11-05T09:59:59.999Z"), revokedAt)).toBe(true);
  });

  it("accepts a session opened during or after the revocation second", () => {
    expect(isSessionRevoked(new Date(revokedAt), revokedAt)).toBe(false);
    expect(isSessionRevoked(new Date("2026-11-05T10:00:00.400Z"), new Date(revokedAt))).toBe(false);
  });
});
