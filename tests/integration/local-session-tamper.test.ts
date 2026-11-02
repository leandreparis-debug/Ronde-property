import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";

import { signLocalSession, verifyLocalSession } from "@/server/auth/local-session";

const SECRET = "x".repeat(32);

describe("local session token", () => {
  it("round-trips a user id", async () => {
    const token = await signLocalSession("00000000-0000-4000-8000-000000000001", SECRET);
    expect(await verifyLocalSession(token, SECRET)).toBe("00000000-0000-4000-8000-000000000001");
  });

  it("rejects a forged, tampered or expired token", async () => {
    const forged = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("00000000-0000-4000-8000-000000000004")
      .setIssuer("ronde-local")
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode("y".repeat(32)));
    expect(await verifyLocalSession(forged, SECRET)).toBeNull();

    const token = await signLocalSession("00000000-0000-4000-8000-000000000001", SECRET);
    expect(await verifyLocalSession(`${token.slice(0, -2)}xx`, SECRET)).toBeNull();

    const expired = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("00000000-0000-4000-8000-000000000001")
      .setIssuer("ronde-local")
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(new TextEncoder().encode(SECRET));
    expect(await verifyLocalSession(expired, SECRET)).toBeNull();
    expect(await verifyLocalSession(undefined, SECRET)).toBeNull();
    expect(await verifyLocalSession("not-a-jwt", SECRET)).toBeNull();
  });
});
